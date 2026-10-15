# Pokemon Explorer

FINNY frontend take-home: a searchable, infinitely scrolling Pokemon grid with expandable cards.

**Live:** https://pokemon-explorer-605570978921.us-central1.run.app

| Path | What |
| --- | --- |
| [`frontend/`](frontend/) | React + Vite app and Express API ([assignment README](frontend/README.md)) |
| [`infra/`](infra/) | Pulumi (TypeScript) program deploying to Google Cloud Run |
| [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) | Lint + build, then `pulumi preview` on PRs / `pulumi up` on `main` |
| [`docs/decisions.md`](docs/decisions.md) | Decision log |

## Deployment

Pushing to `main` deploys. Pulumi builds the Docker image from `frontend/Dockerfile`, pushes it to Artifact Registry,
and rolls out a new Cloud Run revision pinned to the image digest. GitHub Actions authenticates to GCP via Workload
Identity Federation (no service account keys).

One-time setup (already done for `finny-take-home`): `./infra/bootstrap.sh`, then set the three repository variables it prints.

Deploy manually (requires Docker running):

```bash
cd infra
pnpm install
pulumi login gs://finny-take-home-pulumi-state
PULUMI_CONFIG_PASSPHRASE= pulumi up --stack prod
```
