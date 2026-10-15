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

// Built and pushed on every `pulumi up`; Cloud Run is pinned to the digest,
// so a new revision rolls out only when the image content changes.
const image = new dockerBuild.Image(
  'image',
  {
    context: { location: '../frontend' },
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
      scaling: { maxInstanceCount: isProd ? 3 : 1, minInstanceCount: 0 },
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
