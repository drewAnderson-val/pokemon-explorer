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

## 2026-10-15: Public-ready repo is `pokemon-explorer`, separate from the private original

- `drewAnderson-val/pokemon-explorer` (private until submission) holds frontend, infra, CI and docs only, on a fresh
  root commit. The original `finny-take-home` repo (with the product prompt and interviewer notes) stays private and
  untouched; `product/` is gitignored here.

## 2026-10-15: Bootstrap as its own Pulumi stack; post-deploy smoke test

- **Replaced `infra/bootstrap.sh` with `infra/bootstrap/`**, a second Pulumi stack run once by a project owner. Research:
  a human-run bootstrap for state + CI identity is the standard pattern (OpenTofu/Terraform GCS guides do the same with
  scripts); Pulumi's own recommendation (Pulumi Cloud + ESC + `pulumi/auth-actions`) needs a Pulumi Cloud account,
  which is more than this MVP needs. Existing resources were adopted with `pulumi import` (zero diffs), so nothing was
  recreated.
- **The bootstrap stack's state lives in the bucket it manages.** The bucket is `protect`ed so neither stack can
  delete it.
- **Post-deploy checks:** HTTP startup probe on `/healthz` (a broken container never takes traffic) plus a `smoke-test`
  job against the stack's `url` output, following Pulumi's GitHub Actions guide. Not doing tagged no-traffic
  revisions + gradual traffic migration (Google's gold standard); Pulumi's traffic config is declarative, so it'd need
  a two-phase deploy. Overkill for a demo.
- **Actions bumped to Node 24 majors** (checkout v7, setup-node v7, pnpm/action-setup v6, auth v3, setup-buildx v4,
  pulumi/actions v7); release notes checked, no breaking changes affect this workflow.

## 2026-10-15: Health route is `/api/health`, not `/healthz`

- Cloud Run [reserves URL paths ending in `z`](https://docs.cloud.google.com/run/docs/known-issues): public requests
  to `/healthz` get Google's own 404 before reaching the container. The startup probe talks to the container directly,
  so it passed, and the post-deploy smoke test caught it on the first `main` deploy.

## 2026-10-15: Per-PR preview environments as Pulumi stacks

- **What:** every PR gets a `pr-<n>` stack of the app program: its own Cloud Run service
  (`pokemon-explorer-pr-<n>`, max 1 instance, scales to zero), linked from a PR comment that's updated in place,
  destroyed with `pulumi destroy --remove` when the PR closes. Same pattern as Pulumi's managed "review stacks", run
  from GitHub Actions instead of Pulumi Cloud.
- **Rejected: tagged no-traffic revisions on the prod service.** gcloud would mutate a service Pulumi owns, and the
  next `pulumi up` would drop the tags.
- **Shared resources:** `prod` owns the registry and runtime service account; previews reuse them. Shared stack config
  moved to `Pulumi.yaml` so CI can create `pr-<n>` stacks with no committed config.
- **Registry cleanup now always keeps tagged images** (`latest`, `pr-*`). Before, "keep 5 most recent + delete after 7
  days" meant a busy PR could push prod's running image out of the registry.
- **No GitHub "View deployment" button yet:** GitHub environments need a public repo on the Free plan. Add
  `environment: { name: preview, url: ... }` to `preview-env` once the repo is public.
- **Fork PRs get no preview** (no OIDC token or secrets for forks).

## 2026-10-15: Agent instructions in `AGENTS.md`; personal tooling stays local

- **`AGENTS.md` is canonical** (root, `frontend/`, `infra/`); each folder's `CLAUDE.md` is just `@AGENTS.md`. AGENTS.md
  is the cross-tool convention, so reviewers using Codex or Cursor get the same instructions. Claude Code ignores
  `AGENTS.md` when a `CLAUDE.md` exists, hence the one-line imports.
- **Scoped, not global.** Frontend traps load only when an agent works in `frontend/`, infra rules only in `infra/`.
  Previously `FINNY-requirements.md` was imported into every session. Files stay short and list only what an agent
  can't infer from the code (Claude Code docs: under 200 lines; longer files reduce adherence).
- **graphify is personal tooling.** Its hooks moved to gitignored `.claude/settings.local.json` and its instructions to
  gitignored `CLAUDE.local.md`. The hooks hard-coded an absolute path on one machine, which would error for
  anyone else who cloned the repo. `graphify-out/` is gitignored: it's generated, and it would index the private
  `product/` notes. No git hooks for it; run `graphify update .` after code changes.
- **`docs/ai-usage.md`** documents how AI was used, for the interview walkthrough.
- **Not added:** hooks that block commands (overkill for a one-person repo), custom skills/subagents.
