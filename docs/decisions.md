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

## 2026-10-15: Battle screen

- **What:** `/battle?id=N` runs a one-on-one, turn-based battle between creature N (picked with the ▶ BATTLE link on
  an expanded card) and a random wild creature. Rules live in `src/lib/battle/` as pure, unit-tested modules
  (`type-chart`, `moves`, `engine`, `script`, `flow`); the UI is `src/components/battle/` and
  `src/screens/BattleScreen.tsx`.
- **No new API route.** Ids are 1…1000 with no gaps, so `?sort=id&limit=1&page=N` returns creature N, and a random
  page gives the wild one. The client checks the returned id, so a gap would fail loudly instead of fetching the wrong
  creature. Rejected: `GET /api/pokemon/:id` (a server change the brief didn't ask for).
- **Max HP uses the level-50 formula** (`base + 60`), not the raw base stat. With base HP as max HP, a 20 HP creature
  faints to almost any hit. Damage follows the formula given in the brief exactly; non-immune hits do at least 1.
- **Moves are generated, original and deterministic:** 2 of the main type, 1 of the second type (or Normal), 1 Normal,
  from a fixed table of made-up names (power 40–90, accuracy 85–100). The same creature always knows the same moves.
- **Randomness is injected** (`rng`) everywhere, so tests script exact rolls. The reducer (`flow.ts`) stays pure: the
  turn is resolved in the click handler and dispatched as data, which keeps StrictMode's double reducer calls safe.
- **The wild creature is "Wild X" in messages**, because names repeat and both sides can share one.
- **Entry point only on expanded cards**, so the default card keeps one tab stop and the brief's "name and type
  badges" summary. The link is an `<a>` above the stretched name button (`z-10`).
- **Accessibility:** the message box is a stretched "Next message" button, which keeps it valid HTML (unlike a box
  inside a button). A separate `aria-live` region announces whole messages, not each typed character. Focus moves to
  each phase's control (message → FIGHT → last move → Battle again). Typing and HP drain are JS-driven, so they also
  check `prefers-reduced-motion` (CSS already disables the keyframes).
- **Not done:** returning to the explorer is a full page load, so search/filter state resets (same as the existing
  plain-link navigation; state-in-URL was already out of scope). No status moves, items, switching, or crits.

## 2026-10-15: Team, catching and levels

Spec: `docs/superpowers/specs/2026-10-15-team-and-levels-design.md`. Plan: `docs/superpowers/plans/2026-10-15-team-and-levels.md`.

- **What:** a team of up to 6 that travels with you, built from expanded explorer cards and grown by catching. HP,
  fainting, levels and XP carry over between battles until you REST. Battles gain switching (TEAM), catching (CATCH),
  critical hits and real levels.
- **Saved in `localStorage`, keyed by uid.** `{ version: 1, members: [{ uid, creatureId, level, xp, hp }] }`, where
  `hp: null` means full, so REST needs no creature data. Only progress is stored; creature data is fetched by id. A
  corrupt, old or hand-edited save becomes an empty team (or loses just the bad members); blocked storage falls back
  to memory for the session. Rejected: server storage (Cloud Run is stateless; needs a database for one browser's
  team) and URL state (long, brittle links).
- **Stats from the games' formula** (`floor(2·base·L/100) + 5`, HP `+ L + 10`, no IVs/EVs/natures), and the damage
  formula uses the attacker's level. At Lv50 stats are base + 5, so old battles barely change. Rejected: keeping base
  stats and only adding the level term, because then a Lv50 creature barely out-hits a Lv5 one.
- **Catching follows the Gen III curve:** `a = (3·max − 2·hp)·rate / (3·max)`, chance `a / 255`, four shake checks.
  The data has no catch rate, so it's derived from total base stats (255 at 300 → 30 at 1,070, halved for
  legendaries). A failed throw uses the turn. Switch and catch happen before moves, as in the games.
- **XP:** `floor(totalStats/4) × enemyLevel / 7`, level n needs n³ total XP, and catching gives XP too. Crits are
  1/24 at ×1.5 (Gen VII+). Wild levels are the team average ±2, since there's no map.
- **The battle saves after every turn**, so closing the tab keeps the damage. A started battle keeps running even when
  that save makes the team "tired"; the rest prompt only shows before the next battle.
- **The ▶ Battle link** adds that creature only when the team is empty; otherwise battles use the team.
- **Out of scope:** storage boxes (catching past 6), status effects, stat stages, PP, items, run odds, evolution.
- **A creature joins the team once (changed after trying it).** Duplicates were allowed at first, but repeated copies
  of one creature felt wrong in the browser. `addMember` refuses a creature already on the team, the card shows
  "On your team", wild picks skip every team member (so a duplicate can't be caught), and loading an older save keeps
  only the first copy.

## 2026-10-15: Battle juice, sound and timing

Spec: `docs/superpowers/specs/2026-10-15-battle-juice-and-timing-design.md` (built straight from the approved design;
no separate plan document).

- **Timing bar, bonus only.** After picking a move a pointer sweeps a bar; stopping in the middle tenth is ×1.25
  ("Perfect!"), the middle half ×1.1 ("Nice!"), anything else or no press within 2.4 s ×1. It scales only the
  player's damage, after misses and crits are decided. Rejected: a defence press (two presses a turn) and a penalty
  for missing (punishes people who find timing hard). The press position comes from elapsed time against the same
  0.6 s linear CSS animation, so what you see is what's scored, with no per-frame React state.
- **Off under reduced motion, and toggleable.** Timing needs motion, so reduced motion turns it off (the toggle shows
  disabled); screen readers hear "Timing bar: press Space or Enter to strike."
- **Sound synthesised with Web Audio**, no files or library: short square/triangle tunes per cue (hit, crit,
  super-effective, faint, ball throw/shake/catch, level-up, victory). Off by default, since a page that beeps
  unasked is a nuisance; the toggle's click unlocks audio (browsers require a gesture). Rejected: audio files
  (sourcing, licences, weight) and Tone.js (~100 KB for a dozen beeps).
- **Cues live on message steps** (`Step.cue`, `Step.damage`, `Step.at`), so sound and effects fire exactly when the
  line that causes them appears, and are unit-tested without audio.
- **Effects:** floating damage numbers, crit flash + scene shake, super-effective sparkles, an original pixel capture
  orb that wobbles per shake, a gold flash on level-up and a VICTORY!/GOTCHA! ribbon. All stepped, all off under
  reduced motion (flashes and sparkles aren't rendered at all there, since a frozen frame would be a static overlay).
- **One localStorage store helper** (`src/lib/localStore.ts`) now backs both the team and the settings, so the
  blocked-storage fallback is written once.
