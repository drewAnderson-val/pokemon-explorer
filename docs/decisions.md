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

## 2026-10-15: Claude API federation rule matches GitHub's ID-based subject

- GitHub sends this repo's OIDC `sub` in the newer immutable-ID format:
  `repo:drewAnderson-val@261082712/pokemon-explorer@1420820881:pull_request`. A rule using the classic
  `repo:owner/repo:pull_request` never matches: token exchange returns 401 and Authentication events show
  `match_subject_prefix`. The rule now uses the ID-based subject, which is also rename-proof.
- **Debugging tip:** `claude-code-action` hides API errors by default, so a failed exchange only shows up as
  `is_error: true` with zero usage. To see the real error, run `claude -p` with `ANTHROPIC_IDENTITY_TOKEN_FILE` set
  from a temporary workflow job.
- **The review can't run on a PR that changes `ai-review.yml`:** the action requires the workflow file to match
  `main`, so a PR can't rewrite its own reviewer. Workflow changes take effect after merge.
- **Verified** on a throwaway PR (#8) with seeded bugs. It caught all three: unbounded `count` (critical), React
  keys by `name` (high), and search race/encoding/error handling (medium). It also found a real issue on `main`:
  `limit=0` gives `totalPages = Infinity`. ~50 s, $0.20 per review on Opus 5.5.

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

## 2026-10-15: Creature Lab: generated creatures with Nano Banana on Vertex AI

- **What:** a `/create` page where you name a creature, pick 1–2 types and optionally describe it; `POST /api/creatures`
  draws it with Gemini's image model (Nano Banana) and returns a card with rolled stats. A deliberate extra beyond the
  brief, to show the API and GCP side.
- **Vertex AI as the runtime service account, no API key.** Cloud Run already runs as `pokemon-explorer-run`, so the
  bootstrap stack grants it `roles/aiplatform.user` and enables the API. Rejected: a Gemini API key in Secret Manager
  (a secret to rotate and leak when identity auth already exists) and calling Gemini from the browser (exposes the key).
  The IAM grant lives in bootstrap because the CI deployer can't grant project roles, by design.
- **Model `gemini-3.1-flash-lite-image` (Nano Banana 2 Lite), `global` endpoint**, overridable with `IMAGE_MODEL`.
  Cheapest image model (~$0.03 per 1K image); the newer image models aren't served from regional endpoints.
- **The server writes the prompt.** User text only fills quoted name/type/concept fields (newlines and quotes
  stripped), so every image keeps the card style and the input can't replace the instructions. Safety-filter blocks
  return 422 with a friendly message.
- **Spend caps in memory:** 5 per client IP per hour and 100 per day overall, per instance. With prod's 3 max instances
  the worst case is ~300 images (~$10) a day. Rejected for now: a shared counter in Firestore/Redis; the counters reset
  on restart, which is acceptable for a demo. `trust proxy` is 1 so `req.ip` is the caller behind Cloud Run's front end.
- **Nothing is stored on the server** (superseded below: cards are now kept in the browser). Rejected: saving to GCS with a
  shared gallery, which would show strangers' generations to anyone visiting (moderation risk) and add a bucket,
  URLs and a listing endpoint for a feature that doesn't need to persist.

## 2026-10-15: Bootstrap stack actually adopted; billing moved to a credits account

- **The bootstrap stack had no state.** The entry above says its resources were adopted with `pulumi import`, but no
  `pokemon-explorer-bootstrap` stack existed in the state bucket, so a `pulumi up` would have tried to recreate the
  bucket, deployer and WIF pool. Ran `pulumi stack init prod` and `pulumi import --file import.json` against
  `gs://finny-take-home-pulumi-state`: 15 resources adopted with zero diffs, then `pulumi up` created only the Creature
  Lab's two additions (Vertex AI API, `roles/aiplatform.user` for the runtime account).
- **Billing for `finny-take-home` moved to a separate billing account with free credits.** Linked by hand (`gcloud
  billing projects link`) after granting that account `roles/billing.projectManager` on the project; not in Pulumi,
  since billing links are an owner's call, not deploy config. Rejected: running Vertex in a second project under the
  credits account, which would need cross-project IAM that neither stack could manage.
- **Verified live:** `gemini-3.1-flash-lite-image` on the `global` endpoint returns a 1024×1024 JPEG in ~3.5s.

## 2026-10-15: Custom cards are saved in the browser

- **What:** creations are kept in IndexedDB (`src/lib/creation-store.ts`) and listed under "Custom cards" on `/create`
  and behind a "Custom (n)" chip in the explorer, numbered from No.1001. Each card can be downloaded or deleted. The
  explorer filters them with the API's own `queryPokemon`, so search and sort behave the same as for the catalog.
- **Why browser-only:** no sign-in and no new infrastructure, and nobody sees strangers' generations. IndexedDB, not
  localStorage, because each image is ~200 KB against localStorage's ~5 MB. If the browser refuses storage (e.g.
  private mode) the card still shows for that visit.
- **Rejected: tying cards to the client's IP.** It needs the same server storage as a shared gallery, and IPs are
  unreliable as identity: they change (mobile networks, IPv6 privacy addresses) and are shared (an office NAT would
  show colleagues each other's cards). The per-IP rate limit is fine because a limit only needs to be approximate.
- **Copy:** dropped "Up to 5 an hour; nothing is saved…" under the button (the 429 message explains the limit when it
  matters). No AI-attribution tag on the image; the page already says the lab draws it.

## 2026-10-15: Creature Lab guardrails and one-screen layout

- **Guardrails are request config, not extra calls:** `personGeneration: 'ALLOW_NONE'` and
  `prominentPeople: BLOCK_PROMINENT_PEOPLE` (a creature lab never needs a human), and all eight harm categories at
  `BLOCK_LOW_AND_ABOVE` instead of the default medium. Vertex rejects the SDK's own `PersonGeneration.DONT_ALLOW`
  value with a 400, so the documented string is used. Verified live: "a realistic photo of [a celebrity] singing"
  came back as a cartoon puppy with a microphone, "a photo of a man hiking" as a rock golem, and a gore prompt was
  blocked (422). Rejected for now: a separate LLM pre-check of the description (a second call, ~0.5s, more code) and
  word blocklists (easy to dodge, block innocent words). Saved cards are only visible in their creator's browser,
  which lowers the stakes.
- **Vertex's per-minute quota (HTTP 429) maps to 503 + `Retry-After: 60`** ("The lab is busy right now"), not the
  generic 502; a new project's image quota is low enough to hit while testing.
- **Layout fits one laptop screen (~940px tall):** form in a fixed 440px left column (3 type chips per row, ≈690px
  tall), cards on the right; each card goes image-left/details-right once it is ≥36rem wide (a container query on the
  card, so it also works in narrow columns), ≈425px tall.
- **Custom cards are a deck, not a list.** The lab shows one card at a time, newest on top, with up to two card
  edges peeking out underneath and "1 of n" arrows to flip back. A new creation replaces what's shown instead of
  pushing a growing list down the page. The explorer's "Custom" chip still lists them all.
- **Reveal is a card flip.** While the lab draws, a face-down card back (striped, "?") wobbles on top of the deck;
  when the image arrives the new card lifts, turns over in 3D (`rotateY`, the back is a second face with
  `backface-visibility: hidden`) and settles, 760ms. It plays once, only for a card made this visit, not on page
  load or when flipping back to it. Arrows slide cards in from the direction of travel. Smooth easing here rather
  than the app's usual `steps()`: a stepped 3D turn reads as a glitch. All of it is off under reduced motion.
  `add` returns the new id synchronously (the IndexedDB write finishes in the background) so the card mounts
  face-down in the same render instead of flashing face-up first.

## 2026-10-15: Union merges for the decision log

- **Why:** PRs worked on in parallel (one worktree each) all append to the end of `docs/decisions.md`, so any two
  open at once conflicted there (#6 vs #7).
- **What:** `.gitattributes` sets `docs/decisions.md merge=union`, so a local merge keeps both sides' new entries.
  GitHub's merge button ignores merge drivers, so `AGENTS.md` now says to merge `main` into a branch before opening
  a PR, which is where the union driver applies.
- **Rejected:** one file per decision (no conflicts at all, but turns a readable log into a folder of fragments).

## 2026-10-15: Custom cards can battle

- **What:** Creature Lab cards have the catalog card's actions (▶ Battle, + Team) and fight like any creature.
  `creatureQuery` (the one place the battle, team bar and `/battle?id=N` starter look a creature up) resolves ids
  ≥ 1001 from the browser's IndexedDB store instead of `GET /api/pokemon`; a deleted card is a `CreatureNotFoundError`,
  the same "missing" path a vanished catalog id takes. Wild opponents stay catalog-only (`fetchRandomPokemon` already
  ignores ids above the catalog total).
- **Deleting a custom card also removes it from the team**, and its by-id query cache entry is dropped (and primed on
  create): ids are reused after a delete, and the battle caches creatures by id with `staleTime: Infinity`.
- **Rejected: copying custom creatures into the team's saved data.** The team deliberately stores only progress
  (id, level, XP, HP) and looks creatures up; keeping that shape means one lookup rule, not two kinds of member.

## 2026-10-15: Landing page is a game title screen

- **What:** the landing page follows the "Retro Pocket Landing" design: sky with drifting clouds, a bat sprite
  flying across, sparkles, three hills with creature sprites, a dropping EXPLORER wordmark, a three-item title menu
  with a blinking ▶ cursor (first item until you point at another) and "Press start". Sprites are the design's own
  pixel GIFs, in `public/landing/`.
- **Menu:** Start exploring → `/explore`, Battle → `/battle`, Creature Lab → `/create`. The design's third item was
  "Options", which has no page in the app; the lab took its slot.
- **Dropped from the old landing:** the top nav, "1000 creatures on file", the About dialog box, the round play
  button and the type-badge marquee: the menu now does the navigating.
- **Deviation:** the footer sits on a navy pill. White 13px text straight on the hills (as drawn) is ~3:1, under
  WCAG's 4.5:1. Hill colors use the app's existing hill tokens rather than the design's near-identical greens.

## 2026-10-15: "▶ Battle with X" always sends out X

- **Bug:** `/battle?id=N` only used N to start an *empty* team. With anyone already on the team, ▶ Battle on a card
  (catalog or custom) quietly sent out the existing lead instead. Found on the PR preview with a custom card.
- **Fix:** `leadWith(team, creature)` puts X first (the battle sends out the first healthy member): moved up if it's
  on the team, added at the front if there's room. The battle waits until X leads before finding a wild creature, so
  it can't start with the old lead.
- **Full team without X:** a message ("Your team is full, so X can't join") with "Battle with my team" or back to the
  explorer. Rejected: silently replacing a member (loses their levels) or battling X as an unsaved guest (the battle
  saves HP/XP back to team members by uid).

## 2026-10-15: Landing page v2 (marketing-style) replaces the title screen

- **What:** the landing follows "D · Landing page v2" from the style-directions canvas: nav, wordmark, a working
  hero search, floating sample cards, a stats strip, "What will you do?" feature cards, 18 type tiles and a "Ready,
  trainer?" call to action. Replaces the title screen from earlier the same day (its sprites and CSS are removed).
- **It's wired, not a picture:** the hero search is a plain GET form to `/explore?search=…` and the type tiles and
  "Try" chips link to `/explore?type=…`; the explorer reads both once on load (`initialFilters`, unknown types
  ignored, search capped). Numbers come from a new `GET /api/summary` computed once from the data (1,000 creatures,
  9 generations, real per-type counts: the canvas's counts were placeholders).
- **Additions the design predates:** Battle and Create in the nav and as two more feature cards.
- **Sample cards** in the hero are decorative (`aria-hidden`) with letter art, as designed: the catalog's photos
  aren't the creatures, so real records wouldn't look like cards. Type tiles get an `aria-label` ("Fire, 71
  creatures") because the visible text reads as "Fire71".
- **Trimmed to the hero (same day).** Kept the nav, wordmark, sample cards, scenery and stats strip; dropped the
  feature cards, type tiles and "Ready, trainer?" section. The hero's search box became a three-option start menu:
  Go into battle (`/battle`), Creature Lab (`/create`) and Load your roster (`/explore#team`, the explorer's team
  panel, with the team's size shown live). With nothing linking in with `?search=`/`?type=` any more, the explorer's
  URL filters and the summary's per-type counts were removed again; `/api/summary` returns `{ total, generations }`.

## 2026-10-15: The battle screen is a handheld console (desktop), with a four-green "Classic" screen

- **What:** on md+ the battle sits inside a portrait handheld modelled on the original: power strip, a dark bezel
  with the magenta/navy stripes and battery LED, the italic logo, a cross D-pad in a round recess, slanted A/B,
  angled SELECT/START and speaker slots, big rounded bottom-right corner. On phones the shell disappears and the
  battle renders as before. A **Classic** toggle (next to Sound and
  Timing, saved in settings, on by default) posterises the whole screen to the original four greens with an SVG
  filter, so random catalog photos and Gemini art all read as one consistent "sprite" style; off shows full color.
- **One set of controls:** the D-pad/A/B press the keys the keyboard would on whatever the battle has focused
  (arrows; A clicks the focused control or sends Enter; B is Escape), so the battle logic has no second input path.
  They keep focus in the battle (`pointerdown` default prevented) and stay out of the tab order and accessibility tree:
  keyboard and screen-reader users already have the real controls.
- **Portrait, sized from the window height:** a first landscape version read as a generic slab, not the console, and
  ran past the bottom of the window. Now the device's width is `(100svh − 36px) / 1.74` (its measured height/width
  ratio), clamped 440–600px, so the whole console fits; on lg the title and settings move beside it. The battle is
  laid out at 520px and fitted to the glass with CSS `zoom` (scales layout, hit-testing and focus, unlike
  `transform`). Inside the shell the scene goes 4:3 and the text box shrinks (`data-battle-scene`,
  `data-battle-console` in globals.css), so the glass is near-square like the real 160×144 screen. Shell sizes use
  `cqw` so the proportions hold at any width. Unbranded ("Pocket Explorer"): the repo is public.
- **Rejected for now:** pixelating the photos (needs canvas or a resize service per image; the 4-tone posterise
  already sells the look) and working START/SELECT buttons (no battle action maps to them).
- **Fixed screen shape (follow-up):** opening FIGHT grew the battle (four moves with stats plus BACK), so the glass
  stopped being square and the console ran off the window. The glass is now a fixed 520×540 (before zoom); the
  scene flexes into what the text box and menu leave, and, like the real games, the Moves and Team menus take the
  whole bottom row (CSS `:has()`), so each entry fits on one line. No battle logic changed.
- **Full screen:** a button (only where `document.fullscreenEnabled`, so not iPhone Safari) zooms in on the game:
  just the bezel and screen, as large as the display allows (the body, D-pad, buttons, logo and speaker hide; the
  keyboard plays), centred on dark. Escape is the battle's "back", so where Keyboard Lock exists
  (Chromium) the page keeps Escape and you hold it to leave; an "Exit full screen" button is always shown. A refused
  request (no user gesture) leaves the page as it was. Not verified end to end from automation: Chrome refuses
  full screen for synthetic clicks ("not granted"); covered by a unit test of the request.
