# Deployment

Moved out of the README on 2026-10-20 so the README can lead with the app itself.

Everything is Pulumi (TypeScript), split into two stacks that share the `gs://finny-take-home-pulumi-state` backend:

| Stack | Runs | Manages |
| --- | --- | --- |
| `infra/bootstrap` | locally, by a project owner, when its resources change | state bucket, Workload Identity Federation for this repo, `github-deployer` service account + its roles, Cloud SQL, the API's runtime account and secrets, the creature image bucket |
| `infra` | every push to `main`, in GitHub Actions | Artifact Registry, both Docker images, the frontend's runtime service account, both Cloud Run services (frontend: static Caddy; `pokemon-api`: FastAPI), public access |
| `infra` (`pr-<n>`) | every push to a PR; destroyed when it closes | its own frontend image tag and Cloud Run service, built against the prod API (reuses prod's registry + runtime account) |

The split keeps IAM-admin rights out of CI: the deployer can ship the app but cannot change its own permissions.

**Pipeline** ([`deploy.yml`](../.github/workflows/deploy.yml)):

1. `check`: install, lint, tests, typecheck + production build. `check-api`: ruff, mypy and pytest against Postgres.
2. `deploy`: `pulumi preview` on PRs (posted as a PR comment), `pulumi up` on `main`. Pulumi builds the images, pushes them,
   and rolls out Cloud Run revisions pinned to the image digests. A revision only takes traffic once its HTTP startup
   probe on `/api/health` passes (the frontend's is answered by Caddy; the API's checks the database).
3. `smoke-test` (`main` only): on the frontend, `/api/health`, the SPA shell, a deep link and a JSON 404 for unknown
   `/api` paths; on the API, health, pagination, search, auth errors, Swagger, CORS and the 401s on signed-in routes.
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
