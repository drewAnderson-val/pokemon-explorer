import * as gcp from '@pulumi/gcp'
import * as pulumi from '@pulumi/pulumi'

// One-time, admin-run stack: everything CI needs before it can run `pulumi up`
// on the app stack (state bucket, keyless GitHub auth, deployer identity).
// Kept separate so CI never holds IAM-admin rights over its own permissions.
//
// Run locally with project-owner credentials:
//   cd infra/bootstrap && pulumi up --stack prod
const config = new pulumi.Config()
const gcpConfig = new pulumi.Config('gcp')
const project = gcpConfig.require('project')
const region = gcpConfig.require('region')
const githubRepo = config.require('githubRepo')

const apis = [
  'aiplatform.googleapis.com',
  'artifactregistry.googleapis.com',
  'iam.googleapis.com',
  'iamcredentials.googleapis.com',
  'run.googleapis.com',
  'sts.googleapis.com'
].map(
  api =>
    new gcp.projects.Service(api, {
      disableOnDestroy: false,
      service: api
    })
)

// Holds the state for this stack and the app stack, so it must never be deleted.
const stateBucket = new gcp.storage.Bucket(
  'state',
  {
    location: region.toUpperCase(),
    name: `${project}-pulumi-state`,
    uniformBucketLevelAccess: true,
    versioning: { enabled: true }
  },
  { protect: true }
)

const deployer = new gcp.serviceaccount.Account(
  'deployer',
  {
    accountId: 'github-deployer',
    displayName: 'GitHub Actions deployer'
  },
  { dependsOn: apis }
)
const deployerMember = pulumi.interpolate`serviceAccount:${deployer.email}`

// What the app stack (infra/index.ts) manages: registry, image, runtime
// service account, Cloud Run service and its public invoker binding.
for (const role of [
  'roles/artifactregistry.admin',
  'roles/iam.serviceAccountAdmin',
  'roles/iam.serviceAccountUser',
  'roles/run.admin'
]) {
  new gcp.projects.IAMMember(`deployer-${role.split('/')[1]}`, {
    member: deployerMember,
    project,
    role
  })
}

// The creature lab calls Nano Banana on Vertex AI as the Cloud Run runtime
// account (created by the app stack). Granted here because project IAM is
// owner-only; the deployer can't grant roles.
new gcp.projects.IAMMember(
  'runtime-aiplatform-user',
  {
    member: `serviceAccount:pokemon-explorer-run@${project}.iam.gserviceaccount.com`,
    project,
    role: 'roles/aiplatform.user'
  },
  { dependsOn: apis }
)

new gcp.storage.BucketIAMMember('deployer-state', {
  bucket: stateBucket.name,
  member: deployerMember,
  role: 'roles/storage.objectAdmin'
})

const pool = new gcp.iam.WorkloadIdentityPool(
  'github',
  {
    displayName: 'GitHub Actions',
    workloadIdentityPoolId: 'github'
  },
  { dependsOn: apis }
)

const provider = new gcp.iam.WorkloadIdentityPoolProvider('github-oidc', {
  attributeCondition: `assertion.repository == '${githubRepo}'`,
  attributeMapping: {
    'attribute.repository': 'assertion.repository',
    'google.subject': 'assertion.sub'
  },
  oidc: { issuerUri: 'https://token.actions.githubusercontent.com' },
  workloadIdentityPoolId: pool.workloadIdentityPoolId,
  workloadIdentityPoolProviderId: 'github-oidc'
})

new gcp.serviceaccount.IAMMember('deployer-wif', {
  member: pulumi.interpolate`principalSet://iam.googleapis.com/${pool.name}/attribute.repository/${githubRepo}`,
  role: 'roles/iam.workloadIdentityUser',
  serviceAccountId: deployer.name
})

// GitHub repository variables (Settings → Secrets and variables → Actions)
export const GCP_WORKLOAD_IDENTITY_PROVIDER = provider.name
export const GCP_SERVICE_ACCOUNT = deployer.email
export const PULUMI_BACKEND_URL = pulumi.interpolate`gs://${stateBucket.name}`
