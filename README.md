# Pokemon Explorer

FINNY frontend take-home: a searchable, infinitely scrolling Pokemon grid with expandable cards.

**Live:** https://pokemon-explorer-605570978921.us-central1.run.app

| Path | What |
| --- | --- |
| [`frontend/`](frontend/) | React + Vite app and Express API ([assignment README](frontend/README.md)) |
| [`infra/`](infra/) | Pulumi (TypeScript) program deploying to Google Cloud Run |
| [`infra/bootstrap/`](infra/bootstrap/) | One-time Pulumi stack: state bucket, GitHub OIDC, deployer identity |
| [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) | Lint + build → `pulumi preview` (PRs) / `pulumi up` + smoke test (`main`) |
| [`docs/decisions.md`](docs/decisions.md) | Decision log |

## Deployment

Everything is Pulumi (TypeScript), split into two stacks that share the `gs://finny-take-home-pulumi-state` backend:

| Stack | Runs | Manages |
| --- | --- | --- |
| `infra/bootstrap` | once, locally, by a project owner | state bucket, Workload Identity Federation for this repo, `github-deployer` service account + its roles |
| `infra` | every push to `main`, in GitHub Actions | Artifact Registry, Docker image, runtime service account, Cloud Run service, public access |

The split keeps IAM-admin rights out of CI: the deployer can ship the app but cannot change its own permissions.

**Pipeline** ([`deploy.yml`](.github/workflows/deploy.yml)):

1. `check`: install, lint, typecheck + production build.
2. `deploy`: `pulumi preview` on PRs (posted as a PR comment), `pulumi up` on `main`. Pulumi builds the image, pushes it,
   and rolls out a Cloud Run revision pinned to the image digest. The revision only takes traffic once its HTTP startup
   probe on `/healthz` passes.
3. `smoke-test` (`main` only): checks `/healthz`, the SPA shell, API pagination and search against the live URL.

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
