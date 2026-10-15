import * as dockerBuild from '@pulumi/docker-build'
import * as gcp from '@pulumi/gcp'
import * as pulumi from '@pulumi/pulumi'

// Project-level resources (state bucket, CI identity, enabled APIs) live in
// bootstrap.sh so the CI deployer never needs IAM-admin rights.
const gcpConfig = new pulumi.Config('gcp')
const project = gcpConfig.require('project')
const region = gcpConfig.require('region')
const serviceName = 'pokemon-explorer'

const registry = new gcp.artifactregistry.Repository('registry', {
  cleanupPolicies: [
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
  repositoryId: serviceName
})

const registryHost = `${region}-docker.pkg.dev`
const imageName = pulumi.interpolate`${registryHost}/${project}/${registry.repositoryId}/app`

// Built and pushed on every `pulumi up`; Cloud Run is pinned to the digest,
// so a new revision rolls out only when the image content changes.
const image = new dockerBuild.Image('image', {
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
  tags: [pulumi.interpolate`${imageName}:latest`]
})

const runtimeAccount = new gcp.serviceaccount.Account('runtime', {
  accountId: `${serviceName}-run`,
  displayName: 'Pokemon Explorer Cloud Run runtime'
})

const service = new gcp.cloudrunv2.Service('service', {
  deletionProtection: false,
  ingress: 'INGRESS_TRAFFIC_ALL',
  location: region,
  name: serviceName,
  template: {
    containers: [
      {
        image: pulumi.interpolate`${imageName}@${image.digest}`,
        resources: { cpuIdle: true, limits: { cpu: '1', memory: '512Mi' } }
      }
    ],
    scaling: { maxInstanceCount: 3, minInstanceCount: 0 },
    serviceAccount: runtimeAccount.email
  }
})

new gcp.cloudrunv2.ServiceIamMember('public', {
  location: region,
  member: 'allUsers',
  name: service.name,
  role: 'roles/run.invoker'
})

export const url = service.uri
export const imageRef = image.ref
