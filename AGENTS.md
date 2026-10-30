# Pokemon Explorer: agent instructions

FINNY frontend take-home. Read by Claude Code (via `CLAUDE.md`), Codex, Cursor and other agents.
The app lives at the repo root; `infra/AGENTS.md` adds rules for the deploy code.

## Ground rules

- **This repo is public.** Never commit interview correspondence, the product take-home, credentials or personal
  machine paths. Personal agent config goes in gitignored `CLAUDE.local.md` / `.claude/settings.local.json`.
- **Write decisions down.** When a choice between real alternatives is settled, append it to `docs/decisions.md`
  (date, what, why, what was rejected). Reviewers will ask about the reasoning, not just the code.
- **Say what's not done.** If a step is skipped or a check fails, report it with the actual output.
- **Ship through PRs.** `main` deploys to production on every push (`.github/workflows/deploy.yml`).
- **Merge `main` into your branch before opening a PR.** Parallel PRs often append to the same files;
  `docs/decisions.md` merges with `merge=union` locally (`.gitattributes`), but GitHub's merge button ignores that.
- **Before changing UI**, read `docs/FINNY-requirements.md` (what to build, data gotchas) and `docs/DESIGN.md`
  (visual direction). `docs/brief.md` is FINNY's original brief; don't edit it.

## Direction (from 2026-10-26)

The Express backend was rebuilt in **Python (FastAPI) on Postgres**, and the cutover (slice 8) retired Express. The
React app stays and changes only where it meets the new API. Backend decisions and their reasons go in
`docs/backend/decisions.md` (append one entry per decision, using its template); `docs/decisions.md` keeps the Express
app's history.

- **Auth is built in-house:** a users table, password hashing, signup and login routes, one 1-hour access token signed
  with PyJWT. No refresh tokens, no Supabase Auth or Auth0. Keep it small.
- **The owner must be able to explain every line.** Build in thin slices (data and `GET /api/pokemon` first, then
  auth, then battles). Port from the existing TypeScript as the reference, and don't start the next slice until the
  owner has walked through the current one. Prefer plain, explicit code over clever code or extra libraries.
- **Frontend changes stay minimal:** fetch calls to the new API, loading and error states, the JWT on each request,
  CORS.
- **Every battle runs on the server**, wild included: the engine is ported to Python and the client only plays back
  events.
- **Postgres is Cloud SQL** (`pokemon-db`, owner-run bootstrap stack, reached through Cloud Run's built-in connector). The frontend and API deploy
  separately, and **each slice ships live**: the API has its own Cloud Run service from slice 0.
- **Plan:** `docs/superpowers/specs/2026-10-26-fastapi-backend-design.md` (slices, tables, endpoints). Slice 7
  (catalog images into the bucket) is still to do.

## Layout

| Path | What |
| --- | --- |
| `src/` | React 19 + Vite 8 SPA (`@/` aliases `src/`; shadcn/ui primitives in `src/components/ui/`) |
| `api/` | FastAPI service (Python 3.13, uv): `app/` code, `app/db/migrations/` numbered SQL, `tests/` (pytest, real Postgres) |
| `Dockerfile`, `Caddyfile` | The frontend's image: the Vite build served by Caddy (SPA fallback, `/api/health`) |
| `docker-compose.yml` | Local Postgres 17 on port 54329 for the API's dev and tests |
| `infra/` | Pulumi (TypeScript): app stack (CI-run) and `bootstrap/` stack (owner-run). Own `package.json` |
| `.github/review/rules.md` | AI reviewer's custom rules; add a rule to teach it |
| `docs/` | Decision log, requirements, design notes, specs and plans, `ai-usage.md` |

## Traps that aren't obvious from the code

- **Never run `node scripts/generate-pokemon.mjs`.** It's unseeded and overwrites `src/data/pokemon.json` with
  different random records.
- **Key cards by `id`, never `name`.** Names repeat (835 unique of 1,000).
- **Catalog images are WebPs in the creature bucket** (`catalog/<id>.webp`, at most 640 px, any shape), copied once
  by `api/scripts/copy_catalog_images.py`; custom creatures' images come from the lab. Use a fixed aspect ratio,
  `loading="lazy"` and a fallback. Migration 0002 keeps the original placeholder URLs; don't regenerate it.
- **Height and weight are unrounded floats.** Format them for display.
- **Health route is `/api/health`, not `/healthz`.** Cloud Run reserves paths ending in `z`.
- **The frontend container has no API.** Every `/api` route is FastAPI's; the Caddyfile only answers `/api/health`
  (its probe) and a JSON 404 for any other `/api` path. In dev, Vite proxies `/api` to FastAPI on :8000.
- **The TypeScript battle engine (`src/lib/battle/`) is the UI tests' copy.** Battles run in Python; the fake server
  plays them with the TS engine, and `golden.test.ts` keeps it matched to `api/tests/golden/battles.json`. Change the
  Python engine first.
- **`infra/` is a separate pnpm project.** The app's lint, typecheck and Docker image all exclude it; install and
  check it from inside `infra/`.

## Conventions

- Lint is strict (`eslint . --quiet`): `no-console` allows only `debug`, `warn` and `error`; imports are sorted by
  `perfectionist`. Prettier: no semicolons, single quotes, no trailing commas.
- Tests: Vitest + Testing Library (`pnpm test`). UI tests use `src/test/fake-api.ts`, which runs
  `src/lib/query.ts` over the fixture data, so expected counts come from `src/data/pokemon.json`.

## Run it locally

Every `/api` route is FastAPI (`api/`). Three things:

```bash
docker compose up -d --wait db   # Postgres (dev database `pokemon`; tests use `postgres` and wipe it)
pnpm dev:api                     # FastAPI on :8000 (runs migrations on start)
pnpm dev                         # Vite on :5173; proxies /api to :8000
```

To step through API requests, use VS Code's **API: FastAPI (debug)** launch config (`.vscode/launch.json`) instead of
`pnpm dev:api`. `pnpm db:log-sql` streams every statement Postgres runs; `pnpm db:quiet` turns that off.

## Verify before you say it works

```bash
pnpm install && pnpm lint && pnpm test && pnpm build   # lint, tests, typecheck, client bundle
docker build -t web . && docker run --rm -p 8080:8080 web   # the frontend image, as Cloud Run runs it
curl -fsS localhost:8080/api/health && curl -fsS localhost:8080/team | grep -q 'id="root"'
cd infra && pnpm install && pnpm types                 # Pulumi typecheck
docker compose up -d --wait db                        # Postgres for the API
cd api && uv sync && uv run ruff check . && uv run ruff format --check . && uv run mypy && uv run pytest
```

pnpm is pinned via `packageManager` (11.x). pnpm 11 ignores `pnpm.*` build settings in `package.json`; build-script
approvals live in each project's `pnpm-workspace.yaml` (`allowBuilds`).
