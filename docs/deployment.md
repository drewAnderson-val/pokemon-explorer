# Deployment

Moved out of the README on 2026-10-20 so the README can lead with the app itself.

Everything is Pulumi (TypeScript), split into two stacks that share the `gs://finny-take-home-pulumi-state` backend:

| Stack | Runs | Manages |
| --- | --- | --- |
| `infra/bootstrap` | once, locally, by a project owner | state bucket, Workload Identity Federation for this repo, `github-deployer` service account + its roles |
| `infra` | every push to `main`, in GitHub Actions | Artifact Registry, Docker image, runtime service account, Cloud Run service, public access |
| `infra` (`pr-<n>`) | every push to a PR; destroyed when it closes | its own image tag and Cloud Run service (reuses prod's registry + runtime account) |

The split keeps IAM-admin rights out of CI: the deployer can ship the app but cannot change its own permissions.

**Pipeline** ([`deploy.yml`](../.github/workflows/deploy.yml)):

1. `check`: install, lint, tests, typecheck + production build.
2. `deploy`: `pulumi preview` on PRs (posted as a PR comment), `pulumi up` on `main`. Pulumi builds the image, pushes it,
   and rolls out a Cloud Run revision pinned to the image digest. The revision only takes traffic once its HTTP startup
   probe on `/api/health` passes.
3. `smoke-test` (`main` only): checks `/api/health`, the SPA shell, API pagination and search against the live URL.
4. `preview-env` (PRs only): deploys the PR to its own Cloud Run service and posts the link as a PR comment, updated
   on each push. `preview-env-cleanup` destroys it when the PR is merged or closed.

**Local deploys** need Docker running and application-default credentials:

```bash
gcloud auth application-default login
pulumi login gs://finny-take-home-pulumi-state
cd infra && pnpm install
PULUMI_CONFIG_PASSPHRASE= pulumi up --stack prod             # app
cd bootstrap && PULUMI_CONFIG_PASSPHRASE= pulumi up --stack prod  # bootstrap (owner only)
```

**From scratch** (new GCP project): create the state bucket by hand (`gcloud storage buckets create gs://<project>-pulumi-state
--location=us-central1 --uniform-bucket-level-access`), `pulumi import` it into the bootstrap stack, run `pulumi up` in
`infra/bootstrap`, then set its three outputs as GitHub repository variables.
