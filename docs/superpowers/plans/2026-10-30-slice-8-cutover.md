# Slice 8: Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire Express: the frontend's Cloud Run service serves the React build from a static Caddy container,
`server/` is deleted, and frontend code that only Express used goes with it.

**Architecture:** The frontend keeps its Cloud Run service, URL and pipeline. Only the container changes: a Vite
build copied into a pinned Caddy image that serves files, falls back to `index.html` for app routes, and answers
`/api/health` itself. Every `/api` request in dev goes through the Vite proxy to FastAPI. The two bits of `server/`
the frontend still uses move into `src/`: `query.ts` (the Explorer filters your creatures with it) and the lab's
parse/roll (only the test fake server uses it).

**Tech Stack:** Caddy 2.10 (static), Vite 8, React 19, Vitest, Pulumi, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-26-fastapi-backend-design.md` (slice 8; "Open, decided in slice 8").

## Global Constraints

- Static hosting is decided: **a Caddy static container on the existing Cloud Run service** (owner's choice,
  2026-10-30). Same URL, so the API's CORS regex doesn't change.
- Slice 7 (catalog images to the bucket) comes after this slice.
- `/api/health` stays the frontend's probe and smoke-test path (Cloud Run reserves paths ending in `z`).
- Pin image versions exactly: `caddy:2.10.2-alpine`, `node:24-slim` (as today).
- The TypeScript battle engine stays: the UI tests' fake server plays battles with it, and
  `api/tests/golden/battles.json` keeps it matched to the Python engine. Python is now the source of truth, so the
  golden files are frozen fixtures: remove the regenerate path, keep the comparison.
- Lint, Prettier and import-order rules as in `AGENTS.md`. Never run `node scripts/generate-pokemon.mjs`.
- Bootstrap changes are applied by the owner (`pulumi up` in `infra/bootstrap`), never from CI.

## Review Focus

1. Reloading a deep link (`/team`, `/versus/<id>?x=1`, `/login?next=/team`) must return `index.html` with 200.
2. An unknown `/api/...` path on the frontend must be a JSON 404, not `index.html` with 200.
3. A stale hashed asset (`/assets/index-OLDHASH.js` after a deploy) must 404, not return `index.html`. Otherwise
   the browser parses HTML as JS and the page goes blank.
4. `index.html` must not be cached long (`no-cache`), or a deploy won't reach returning visitors. Hashed
   `/assets/*` files are cached for a year (`immutable`).
5. In dev, a friend match's SSE stream (`/api/matches/<id>/events`) must stream through the Vite proxy.

Items 1–4 are checked in Task 2 Step 3 against the built container. Item 5 is checked in Task 3 Step 4.

---

### Task 1: Move what the frontend still uses out of `server/`

**Files:**
- Create: `src/lib/query.ts`, `src/lib/query.test.ts` (moved from `server/query.ts`, `server/query.test.ts`)
- Create: `src/test/fake-lab.ts` (`parseCreatureRequest`, `rollCreature` moved from `server/create.ts`)
- Modify: `src/screens/ExplorerScreen.tsx:27`, `src/test/fake-api.ts:5`, `src/test/fake-server.ts:22`

**Interfaces:**
- Produces: `@/lib/query` exporting `parsePokemonQuery` and `queryPokemon`, unchanged.
  `src/test/fake-lab.ts` exporting `parseCreatureRequest` and `rollCreature`, unchanged.

- [ ] **Step 1:** `git mv server/query.ts src/lib/query.ts` and `git mv server/query.test.ts src/lib/query.test.ts`.
  Fix the moved files' relative imports to `@/` aliases.
- [ ] **Step 2:** Create `src/test/fake-lab.ts` with the two functions and the constants they need from
  `server/create.ts`. Drop the prompt builder and anything else only the Express route used. The Python lab owns
  the real validation, so `server/create.test.ts` is not moved.
- [ ] **Step 3:** Point the three importers at the new paths.
- [ ] **Step 4:** Run `pnpm vitest run --exclude '.claude/**' src`. Expected: all pass; `query.test.ts` runs from its
  new place.
- [ ] **Step 5:** Commit: `Move the catalog query and the lab fakes out of server/`.

### Task 2: The static container

**Files:**
- Create: `Caddyfile`
- Modify: `Dockerfile`, `.dockerignore`

- [ ] **Step 1: `Caddyfile`.** These are the routing rules the tests below pin:

```caddyfile
{
	admin off
	auto_https off
}

:{$PORT:8080} {
	root * /srv
	encode zstd gzip

	# The startup probe and smoke test. Not /healthz: Cloud Run reserves paths ending in z.
	handle /api/health {
		header Content-Type application/json
		respond `{"status":"ok"}` 200
	}
	# The API lives on its own service; an /api path here is a mistake, so a JSON 404, not the app.
	handle /api/* {
		header Content-Type application/json
		respond `{"error":"Not found"}` 404
	}
	# Hashed build files: cached for good, and a missing one is a 404 (never index.html).
	handle /assets/* {
		header Cache-Control "public, max-age=31536000, immutable"
		file_server
	}
	# Everything else is the app: a file if one exists, otherwise index.html for the router.
	handle {
		header Cache-Control "no-cache"
		try_files {path} /index.html
		file_server
	}
}
```

- [ ] **Step 2: `Dockerfile`.** Build stage as today, but `RUN pnpm build` only (no prune). Runtime stage
  `FROM caddy:2.10.2-alpine`, `COPY Caddyfile /etc/caddy/Caddyfile`, `COPY --from=build /app/dist /srv`. Keep the
  `VITE_API_URL` build arg. Drop `dist-server` from `.dockerignore`.
- [ ] **Step 3: Check the container against Review Focus 1–4.** `docker build --build-arg VITE_API_URL=http://x -t web-check .`,
  run it with `-e PORT=8080 -p 18081:8080`, then:
  - `curl -fsS :18081/api/health` → `{"status":"ok"}`
  - `/`, `/team`, `/versus/abc?x=1`, `/login?next=/team` → 200 and contain `<div id="root">`
  - `/api/nope` → 404 with body `{"error":"Not found"}`
  - `/assets/index-OLDHASH.js` → 404
  - a real asset from `dist/assets/` → 200, `Cache-Control: public, max-age=31536000, immutable`
  - `/` → `Cache-Control: no-cache`

  Expected: every line as stated. Paste any mismatch.
- [ ] **Step 4:** Commit: `Serve the frontend from a static Caddy container`.

### Task 3: Dev and build without Express; delete `server/`

**Files:**
- Modify: `vite.config.ts`, `package.json`, `tsconfig.json:27`, `eslint.config.ts:13`, `pnpm-lock.yaml`
- Delete: `server/`

- [ ] **Step 1:** `vite.config.ts`: drop the Express middleware plugin, `FASTAPI_ROUTES` and `isFastApi`. Use
  `server.proxy: { '/api': 'http://localhost:8000' }`.
- [ ] **Step 2:** `package.json`:
  - `build` becomes `tsc -b && vite build`.
  - Remove `start` and `server`.
  - Add `"preview": "vite preview"` (it reuses the dev proxy).
  - `pnpm remove express @types/express`, plus any other dependency only `server/` used (check with grep).

  `tsconfig.json`: drop `"server"` from `include`. `eslint.config.ts`: drop `dist-server/**`.
- [ ] **Step 3:** `git rm -r server/`. Then: `pnpm lint && pnpm vitest run --exclude '.claude/**' && pnpm build`.
  Expected: all pass, and `dist-server/` is not created.
- [ ] **Step 4: Dev check (Review Focus 5).** Run `pnpm dev:api` and `pnpm dev`. Check:
  - `curl :5173/api/pokemon?limit=1` returns data.
  - `curl :5173/api/health` returns the API's health.
  - `curl -N ':5173/api/matches/<id>/events?token=<dev token>'` streams. Use a dev account made through
    `:5173/api/auth/signup` and a match it creates. The first event must arrive without waiting for the stream to
    close.
- [ ] **Step 5:** Commit: `Delete the Express server: Vite proxies every /api request to FastAPI`.

### Task 4: Remove frontend code only Express or tests used

**Files:**
- Modify: `src/lib/api.ts` (`fetchRandomPokemon`), `src/hooks/useTeam.ts` (`updateTeam`), `src/lib/creature.ts`
  (`CreatureResponse`), `src/lib/team/team.ts` (`TEAM_VERSION`, `parseTeam`, `serializeTeam`, `restAll`;
  `saveBattle` moves into `src/test/fake-server.ts`, its only user), `src/lib/battle/golden.test.ts` (drop the
  `UPDATE_GOLDEN` write path)
- Modify: the tests of each removed export

- [ ] **Step 1:** Remove each export and the tests that only test it. Whatever a removed function used that's now
  unused goes too; lint and `tsc -b` will name them.
- [ ] **Step 2:** Re-run the export scan: list every export in non-test `src/` files that no other non-test `src/`
  file uses. Expected: only exports used in their own file, shadcn `components/ui`, and the engine/versus functions
  the fake server and golden test use (kept, per Global Constraints). Anything else goes in this task, or gets a
  ledger ruling.
- [ ] **Step 3:** `pnpm lint && pnpm vitest run --exclude '.claude/**' && pnpm build`. Expected: all pass.
- [ ] **Step 4:** Commit: `Remove frontend code only Express used`.

### Task 5: Infra and the pipeline

**Files:**
- Modify: `infra/index.ts` (the frontend container's `GOOGLE_CLOUD_PROJECT` env and its comment), `infra/bootstrap/index.ts`
  (the frontend runtime account's `runtime-aiplatform-user` role: only the Express lab called Vertex)
- Modify: `.github/workflows/deploy.yml` (smoke tests)

- [ ] **Step 1:** Remove the env and the role. Check that nothing else in either stack references them.
- [ ] **Step 2:** `deploy.yml` smoke tests:
  - Delete "API returns paginated data" and "Search filters results" on `$URL`. The same checks already run
    against `$API_URL`.
  - Add "Deep links serve the app": `curl -fsS "$URL/team" | grep -q '<div id="root">'`.
  - Add "Unknown API paths are a JSON 404 on the frontend": the status is 404.
  - Fix the comment that mentions "the Express checks".
- [ ] **Step 3:** `cd infra && pnpm types`. Then `PULUMI_CONFIG_PASSPHRASE= pulumi preview --stack prod --diff` for
  both stacks. Expected:
  - app stack: the env removed and the image rebuilt, nothing deleted.
  - bootstrap: 1 delete (the IAM member), nothing else.

  Remove the stray `infra/Pulumi.prod.yaml` that preview leaves behind.
- [ ] **Step 4:** Commit: `Drop the Express lab's Vertex access and its smoke tests`.

### Task 6: Docs

**Files:**
- Modify: `README.md`, `AGENTS.md` (Layout, Traps, Run it locally, Verify, Conventions' `fake-api` line),
  `docs/deployment.md`, `docs/backend/decisions.md`, the spec's "Open, decided in slice 8" section
  (record the answer)

- [ ] **Step 1:** README:
  - How to run it: Postgres, `pnpm dev:api`, `pnpm dev`.
  - Architecture: a short text diagram with static frontend → FastAPI → Cloud SQL, bucket and Vertex.
  - "Decisions and trade-offs" linking `docs/backend/decisions.md`.
  - "What I'd add at scale", with the spec's list.
  - Remove `pnpm start` and every Express mention.
- [ ] **Step 2:** AGENTS.md:
  - Drop the `server/` row and the traps about `server/app.ts` and `server/index.ts`.
  - The Direction section says the cutover is done.
  - Verify commands: `pnpm build`, then the Task 2 container check, instead of `pnpm start`.
- [ ] **Step 3:** Backend decision entry "2026-10-30: The frontend is a static Caddy container on its Cloud Run
  service". Rejected options: Firebase Hosting (new tool, new URL, CORS change) and a bucket with a CDN (load
  balancer about $18/month). Trade-off: no CDN in front.
- [ ] **Step 4:** Check that no file outside `docs/decisions.md`, `docs/brief.md`, `docs/FINNY-requirements.md`,
  `docs/superpowers/` and `.github/review/` still names `server/`, Express or `pnpm start`: `git grep -nE "server/|Express|pnpm start"`.
  Those excluded files are history, and history stays. Expected: no other hits, or each remaining hit is about the
  past.
- [ ] **Step 5:** Commit: `Docs for the cutover`.

## After merge

- Owner runs `cd infra/bootstrap && pulumi up --stack prod` (1 delete). Either order works: the frontend no longer
  calls Vertex.
- Watch the deploy and the smoke tests; open the live site, reload on `/team`, play a wild battle.
