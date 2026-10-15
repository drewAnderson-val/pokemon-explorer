# Decisions

## 2026-10-15: Host on Cloud Run in a dedicated GCP project

- **Where:** a new project, `finny-take-home`, so the public demo is isolated and can be deleted after the interview.
- **How:** one Cloud Run service (`pokemon-explorer`, us-central1) serving both the built SPA and the Express API.
  Scales to zero, max 3 instances, public.
- **Why not static hosting (GCS/Firebase):** `/api/pokemon` is an Express app; one container keeps prod identical to dev.
- **Server:** added `frontend/server/index.ts` (referenced by the starter README but missing), bundled with
  `vite build --ssr` to `dist-server/`, which inlines `pokemon.json`.
- **pnpm 11:** the starter's `pnpm.onlyBuiltDependencies` in package.json is ignored by pnpm 11 and install fails on
  esbuild's build script. Moved to `pnpm-workspace.yaml` (`allowBuilds`).

## 2026-10-15: Manage deployments with Pulumi (TypeScript) + GitHub Actions

- **Alternatives considered:** CDKTF (deprecated by HashiCorp, archived Dec 2025); Cloud Functions (doesn't fit an
  Express + SPA app). Pulumi in TypeScript keeps one language and toolchain across the repo.
- **Split:** `infra/bootstrap.sh` (gcloud, run once by a human) owns the state bucket, Workload Identity Federation,
  and the deployer service account. Pulumi owns the app: Artifact Registry repo, image build/push
  (`@pulumi/docker-build`), runtime service account, Cloud Run service, public invoker binding. This keeps IAM-admin
  rights out of CI.
- **State:** self-managed GCS backend (`gs://finny-take-home-pulumi-state`, versioned) instead of Pulumi Cloud, so
  there's no extra account. Stack config holds no secrets, so the passphrase is empty.
- **Rollout:** Cloud Run is pinned to the image digest, so unchanged code produces no new revision.
