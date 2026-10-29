import * as dockerBuild from '@pulumi/docker-build'
import * as gcp from '@pulumi/gcp'
import * as pulumi from '@pulumi/pulumi'

// Project-level resources (state bucket, CI identity, enabled APIs) live in
// the bootstrap stack so the CI deployer never needs IAM-admin rights.
//
// Stacks: `prod` owns the shared registry and runtime service account.
// `pr-<n>` stacks are per-PR previews created and destroyed by CI; they reuse
// the shared resources and add only their own image tag and Cloud Run service.
const gcpConfig = new pulumi.Config('gcp')
const project = gcpConfig.require('project')
const region = gcpConfig.require('region')
const stack = pulumi.getStack()
const isProd = stack === 'prod'

const appName = 'pokemon-explorer'
const serviceName = isProd ? appName : `${appName}-${stack}`
const registryHost = `${region}-docker.pkg.dev`
const imageName = `${registryHost}/${project}/${appName}/app`
const runtimeAccountId = `${appName}-run`

// prod creates the shared resources; previews just depend on them existing.
const shared: pulumi.Resource[] = []
if (isProd) {
  const registry = new gcp.artifactregistry.Repository('registry', {
    cleanupPolicies: [
      // Images a stack currently deploys are always tagged (latest / pr-<n>),
      // so busy PRs can never push prod's running image out of the registry.
      {
        action: 'KEEP',
        condition: { tagPrefixes: ['latest', 'pr-'], tagState: 'TAGGED' },
        id: 'keep-deployed'
      },
      {
        action: 'KEEP',
        id: 'keep-recent',
        mostRecentVersions: { keepCount: 5 }
      },
      {
        action: 'DELETE',
        condition: { olderThan: '604800s' },
        id: 'delete-old'
      }
    ],
    format: 'DOCKER',
    location: region,
    repositoryId: appName
  })

  const runtimeAccount = new gcp.serviceaccount.Account('runtime', {
    accountId: runtimeAccountId,
    displayName: 'Pokemon Explorer Cloud Run runtime'
  })
  shared.push(registry, runtimeAccount)
}

// Cloud Run's URL hash for this project and region (in every service's URL).
// A constant: reading it from the Express service's URI would make the API
// depend on the frontend's deploy.
const CLOUD_RUN_HASH = 'ogxllptvoa'
// The prod frontend and every PR preview (pokemon-explorer-pr-<n>).
const frontendOrigins = `^https://${appName}(-pr-\\d+)?-${CLOUD_RUN_HASH}-uc\\.a\\.run\\.app$`

// The FastAPI service (api/), prod only: PR previews would share the prod
// database, so a PR's migrations would change prod. Previews build their
// frontend against the prod API (read-only routes so far). Its Cloud SQL
// instance, runtime account and secrets come from the bootstrap stack.
const apiService = isProd ? deployApi() : undefined
const apiUri: pulumi.Output<string> = apiService
  ? apiService.uri
  : gcp.cloudrunv2.getServiceOutput({ location: region, name: 'pokemon-api' })
      .uri

// Built and pushed on every `pulumi up`; Cloud Run is pinned to the digest,
// so a new revision rolls out only when the image content changes.
const image = new dockerBuild.Image(
  'image',
  {
    // The client bundle calls the FastAPI service at this origin.
    buildArgs: { VITE_API_URL: apiUri },
    context: { location: '..' },
    platforms: ['linux/amd64'],
    push: true,
    registries: [
      {
        address: registryHost,
        password: gcp.organizations
          .getClientConfigOutput()
          .apply(c => pulumi.secret(c.accessToken)),
        username: 'oauth2accesstoken'
      }
    ],
    tags: [`${imageName}:${isProd ? 'latest' : stack}`]
  },
  { dependsOn: shared }
)

const service = new gcp.cloudrunv2.Service(
  'service',
  {
    deletionProtection: false,
    ingress: 'INGRESS_TRAFFIC_ALL',
    location: region,
    name: serviceName,
    template: {
      containers: [
        {
          // Vertex AI project for the creature lab's image generation.
          envs: [{ name: 'GOOGLE_CLOUD_PROJECT', value: project }],
          image: pulumi.interpolate`${imageName}@${image.digest}`,
          resources: { cpuIdle: true, limits: { cpu: '1', memory: '512Mi' } },
          // A revision only receives traffic once /api/health answers; ~20s budget.
          startupProbe: {
            failureThreshold: 10,
            httpGet: { path: '/api/health' },
            periodSeconds: 2,
            timeoutSeconds: 1
          }
        }
      ],
      // Idle SSE streams are cheap; the default of 80 would cap the one instance at ~40 friend battles.
      maxInstanceRequestConcurrency: 1000,
      // One instance in prod: friend battles live in memory, so both players must reach the same server.
      scaling: { maxInstanceCount: 1, minInstanceCount: 0 },
      serviceAccount: `${runtimeAccountId}@${project}.iam.gserviceaccount.com`
    }
  },
  { dependsOn: shared }
)

new gcp.cloudrunv2.ServiceIamMember('public', {
  location: region,
  member: 'allUsers',
  name: service.name,
  role: 'roles/run.invoker'
})

export const url = service.uri
export const imageRef = image.ref

export const apiUrl = apiService?.uri

function deployApi() {
  const apiImageName = `${registryHost}/${project}/${appName}/api`
  const apiDbConnectionName = `${project}:${region}:pokemon-db`
  const apiImage = new dockerBuild.Image(
    'api-image',
    {
      context: { location: '../api' },
      platforms: ['linux/amd64'],
      push: true,
      registries: [
        {
          address: registryHost,
          password: gcp.organizations
            .getClientConfigOutput()
            .apply(c => pulumi.secret(c.accessToken)),
          username: 'oauth2accesstoken'
        }
      ],
      tags: [`${apiImageName}:latest`]
    },
    { dependsOn: shared }
  )

  const secretEnv = (name: string, secret: string) => ({
    name,
    valueSource: { secretKeyRef: { secret, version: 'latest' } }
  })

  const service = new gcp.cloudrunv2.Service('api-service', {
    deletionProtection: false,
    ingress: 'INGRESS_TRAFFIC_ALL',
    location: region,
    name: 'pokemon-api',
    template: {
      containers: [
        {
          envs: [
            { name: 'CORS_ORIGIN_REGEX', value: frontendOrigins },
            secretEnv('DATABASE_URL', 'api-database-url'),
            secretEnv('JWT_SECRET', 'api-jwt-secret')
          ],
          image: pulumi.interpolate`${apiImageName}@${apiImage.digest}`,
          resources: { cpuIdle: true, limits: { cpu: '1', memory: '512Mi' } },
          // Startup runs migrations, then /api/health checks the database: ~30s
          // budget. Cloud Run requires timeoutSeconds <= periodSeconds.
          startupProbe: {
            failureThreshold: 10,
            httpGet: { path: '/api/health' },
            periodSeconds: 3,
            timeoutSeconds: 3
          },
          volumeMounts: [{ mountPath: '/cloudsql', name: 'cloudsql' }]
        }
      ],
      scaling: { maxInstanceCount: 2, minInstanceCount: 0 },
      serviceAccount: `pokemon-api-run@${project}.iam.gserviceaccount.com`,
      // Friend-match event streams are long requests; the client reconnects when
      // one ends, so the hour is a ceiling, not a requirement.
      timeout: '3600s',
      // Cloud Run's built-in Cloud SQL connector: a Unix socket under /cloudsql,
      // which DATABASE_URL points at (?host=/cloudsql/<connection name>).
      volumes: [
        {
          cloudSqlInstance: { instances: [apiDbConnectionName] },
          name: 'cloudsql'
        }
      ]
    }
  })

  new gcp.cloudrunv2.ServiceIamMember('api-public', {
    location: region,
    member: 'allUsers',
    name: service.name,
    role: 'roles/run.invoker'
  })

  return service
}
