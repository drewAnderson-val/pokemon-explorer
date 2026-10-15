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

## 2026-10-15: Our own Greptile-style AI review, built on Claude

- **What:** `.github/workflows/ai-review.yml`, one job per PR. It builds a codebase graph with graphify (AST only, no
  LLM, a few seconds). A Claude agent (`anthropics/claude-code-action`, Opus 5.5) then loads every `AGENTS.md` plus
  `.github/review/rules.md` and investigates the change: graph lookups for dependents, full files, `git blame`. It
  checks bugs, security, infra and repo rules, and verifies each finding with a concrete failure scenario (anything
  below 80 confidence is dropped). It posts inline comments with suggested fixes, plus one summary comment updated in
  place (summary, Mermaid diagram, 1–5 merge confidence, findings table).
- **Why build it instead of using Greptile:** Greptile is itself a Claude Agent SDK agent with codebase-context,
  similar-function and git-history tools (Anthropic customer story). The same recipe here is about 100 lines of YAML.
  Rules live in the repo, code isn't sent to another vendor, and it costs API tokens instead of a seat.
- **What Greptile still does better:** a persistent index with semantic similar-function search, learning from 👍/👎
  reactions, prompt caching (~90% hit rate), and evals behind its prompts. Our stand-in for learning is a written one:
  edit `.github/review/rules.md`.
- **Alternatives considered:**
  - The official `code-review` plugin: compliance + obvious bugs only, with no summary and no graph.
  - Anthropic's `claude-code-security-review`: dropped to keep one job; the reviewer covers security with repo
    context.
  - Open-source PR-Agent (Qodo) and Kodus: general-purpose, but more to configure than this.
  - Anthropic's managed Code Review: Team/Enterprise only.
  - Vertex AI: GCP credits aren't documented to cover Claude.
- **Auth: Workload Identity Federation, not an API key.** The workflow's GitHub OIDC token is exchanged for a
  short-lived Claude API token. The Console federation rule matches only this repo's `pull_request` runs, pinned by
  subject plus the numeric owner and repo IDs, so a renamed or re-registered account can't match. No secret is
  stored. It's the same pattern as the GCP deploys. The rule, organization and workspace IDs are identifiers, so they
  live in repo variables.
- **Guardrails:** the reviewer can only read code, query the graph and comment on this PR (`--allowedTools`). PR
  content is treated as data. Runs skip drafts and fork PRs, skip cleanly without the key, and cancel superseded runs
  (safe because reviews are read-only).

## 2026-10-15: Battle Box UI: data, scroll, cards, routing

- **API gains `type` and `sort`, plus validation.** The spec's type chips and NO./STRONGEST/FASTEST sort need
  them. Doing either client-side over loaded pages would sort only what's been scrolled past and miscount results.
  `server/query.ts` holds pure `parsePokemonQuery` / `queryPokemon`; bad `page`/`limit`/`sort`/`type` now return
  400 instead of nonsense pages. `type` matches exactly (case-insensitive); free-text `search` keeps its original
  substring semantics.
- **TanStack Query `useInfiniteQuery`** over a hand-rolled hook. The key includes search/type/sort, so a new search
  starts at page 1 and the superseded request is aborted through its `AbortSignal` (no stale results).
  `fetchNextPage` retries just the failed page and keeps loaded cards. Window-focus refetch is off: the data is
  static, and an infinite query refetches every loaded page.
- **IntersectionObserver sentinel** (600px root margin) over a scroll listener. The observer is recreated after each
  loaded page, so a tall screen that the first page doesn't fill keeps loading instead of stalling. It's keyed on
  the page count, not just "not currently fetching": a fast response can start and finish within one render, so that
  flag never visibly flips (a test caught this).
- **Cards expand in place** (2 grid rows, `grid-auto-flow: dense`), as in the design, rather than in a dialog. The
  name is the real `<button aria-expanded aria-controls>` and its `::after` stretches over the card. Making the
  whole card a `<button>` would put the stats and description into its accessible name, and block content in a
  button is invalid HTML.
- **No router.** Two screens chosen by `location.pathname` (`/explore` vs everything else) with plain links between
  them. Prod already serves `index.html` for every path.
- **Not done (deliberately):** search/filter state in the URL, list virtualization (1,000 lazy-image cards render
  fine), dark theme (spec is light-only).
- **Spec adjustments:** ▼ prompts are ink on white boxes (accent yellow is ~1.5:1 there); error copy is bold so
  #E04038 on white passes as large text (it's 4.2:1); below 480px the decorative "SORT" word is hidden and the sort
  box goes full width so its three options fit on one row; the spec's `font-*` sizes are `text-*` utilities and its
  `border-*` tokens are `frame-*` utilities (Tailwind namespaces, see `frontend/DESIGN.md`).
- **Hex color tokens, not OKLCH.** Kept the spec's hex values verbatim so tokens can be checked against it 1:1.
- **Fonts self-hosted** with `@fontsource/pixelify-sans` rather than Google Fonts: no third-party request and no
  layout shift from a late stylesheet.
- **Testing:** Vitest + Testing Library + jsdom. The fetch stub runs the real query code over the fixture data, so
  UI tests exercise real filtering and paging without a server.
- **Dependency versions respect pnpm 11's `minimumReleaseAge`.** vitest 5.0.5, jsdom 30.1.3 and react-query 5.104.3
  were published the same day, and `pnpm add` silently wrote `minimumReleaseAgeExclude` entries to bypass the
  check. Pinned the previous releases (5.0.4, 30.1.2, 5.104.2) instead, so the supply-chain guard stays intact.
- **SPA fallback uses `sendFile('index.html', { root })`.** With an absolute path, `send` rejects any path containing
  a dot-directory, so `/explore` 404'd when the repo is checked out under e.g. `~/.something` (prod's `/app` was fine).

## 2026-10-15: Tried and removed a stat radar on expanded cards

- Built a hexagon radar of the six stats (SVG from polar coordinates, one fixed 255 scale). In the browser it made
  every expanded card ~210px taller while repeating the numbers the stat list already shows. Removed it to keep
  the card simple; the dotted stat list stays the single view of the stats.

## 2026-10-15: App at the repo root, infra as a subfolder

- **What:** moved everything from `frontend/` to the repo root; `infra/` stays as a subfolder with its own
  `package.json`. FINNY's original brief moved to `docs/brief.md`; `DESIGN.md` and `FINNY-requirements.md` to `docs/`;
  the two `AGENTS.md` files merged into the root one.
- **Why:** it's one app. Reviewers open the repo and see a standard Vite project (`pnpm install && pnpm dev`), and
  `infra/` exists only to deploy it.
- **Kept infra in this repo** rather than splitting it out: a separate repo would stop deploys until it exists, and
  the Workload Identity trust (owner-run bootstrap stack) would need updating to allow the new repo.
- **Isolation:** the app's ESLint ignores `infra/**`, `.dockerignore` keeps `infra`, `docs` and markdown out of the
  image, and Pulumi's Docker build context is now the repo root (`..` from `infra/`). CI triggers on everything except
  `docs/**` and markdown.

## 2026-10-15: Reliable images, capped search, no database

- **LoremFlickr links become seeded Picsum images.** Half the fixture images point at LoremFlickr, which returned
  HTTP 500s throughout development, so those cards always showed the letter fallback. `cardImageUrl` maps them to
  `picsum.photos/seed/lock-<lock>/480/360`, so each creature keeps the same image on every load; Picsum links are
  only resized. The data file is untouched.
- **Search is capped at 100 characters** (`MAX_SEARCH_LENGTH`, shared by the API and the input's `maxLength`). Longer
  searches return 400 instead of scanning all 1,000 records with an arbitrarily long string. Flagged by the AI reviewer.
- **Rejected for now: a database in GCP.** The data's quirks (repeated names, random photos) come from what was
  generated, not from storing it in a JSON file, so a database would serve the same records over the network. Cloud
  SQL adds an always-on cost (~$10–30/month), a connector, secrets and migrations; Firestore scales to zero but has no
  substring search. If backend depth is wanted later, Cloud SQL Postgres + Drizzle, managed by Pulumi and seeded from
  the JSON, as a separate PR.

## 2026-10-15: Union merges for the decision log

- **Why:** PRs worked on in parallel (one worktree each) all append to the end of `docs/decisions.md`, so any two
  open at once conflicted there (#6 vs #7).
- **What:** `.gitattributes` sets `docs/decisions.md merge=union`, so a local merge keeps both sides' new entries.
  GitHub's merge button ignores merge drivers, so `AGENTS.md` now says to merge `main` into a branch before opening
  a PR, which is where the union driver applies.
- **Rejected:** one file per decision (no conflicts at all, but turns a readable log into a folder of fragments).
