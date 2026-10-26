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

The Express backend is being rebuilt in **Python (FastAPI) on Postgres**. The React app stays and changes only where
it meets the new API. Backend decisions and their reasons go in `docs/backend/decisions.md` (append one entry per
decision, using its template); `docs/decisions.md` keeps the Express app's history.

- **Auth is built in-house:** a users table, password hashing, signup and login routes, one 1-hour access token signed
  with PyJWT. No refresh tokens, no Supabase Auth or Auth0. Keep it small.
- **The owner must be able to explain every line.** Build in thin slices (data and `GET /api/pokemon` first, then
  auth, then battles). Port from the existing TypeScript as the reference, and don't start the next slice until the
  owner has walked through the current one. Prefer plain, explicit code over clever code or extra libraries.
- **Frontend changes stay minimal:** fetch calls to the new API, loading and error states, the JWT on each request,
  CORS.
- **Every battle runs on the server**, wild included: the engine is ported to Python and the client only plays back
  events.
- **Postgres is on Supabase** (database only: no Supabase Auth, every table has RLS on). The frontend and API deploy
  separately, and **each slice ships live**: the API has its own Cloud Run service from slice 0.
- **Plan:** `docs/superpowers/specs/2026-10-26-fastapi-backend-design.md` (slices, tables, endpoints). Until slice 8,
  the Express code below still serves the React build and any endpoints not yet moved.

## Layout

| Path | What |
| --- | --- |
| `src/` | React 19 + Vite 8 SPA (`@/` aliases `src/`; shadcn/ui primitives in `src/components/ui/`) |
| `server/` | Express 5 API (`app.ts`) and prod entry (`index.ts`); one container in prod |
| `infra/` | Pulumi (TypeScript): app stack (CI-run) and `bootstrap/` stack (owner-run). Own `package.json` |
| `.github/review/rules.md` | AI reviewer's custom rules; add a rule to teach it |
| `docs/` | Decision log, requirements, design notes, specs and plans, `ai-usage.md` |

## Traps that aren't obvious from the code

- **Never run `node scripts/generate-pokemon.mjs`.** It's unseeded and overwrites `src/data/pokemon.json` with
  different random records.
- **Key cards by `id`, never `name`.** Names repeat (835 unique of 1,000).
- **`imageUrl`s are slow, random-sized placeholders that sometimes fail.** Use a fixed aspect ratio,
  `loading="lazy"` and a fallback.
- **Height and weight are unrounded floats.** Format them for display.
- **Health route is `/api/health`, not `/healthz`.** Cloud Run reserves paths ending in `z`.
- **`server/app.ts` serves both dev (Vite middleware) and prod (`server/index.ts`).** Keep API routes there; keep
  prod-only concerns (static files, health route, port) in `index.ts`.
- **`infra/` is a separate pnpm project.** The app's lint, typecheck and Docker image all exclude it; install and
  check it from inside `infra/`.

## Conventions

- Lint is strict (`eslint . --quiet`): `no-console` allows only `debug`, `warn` and `error`; imports are sorted by
  `perfectionist`. Prettier: no semicolons, single quotes, no trailing commas.
- Tests: Vitest + Testing Library (`pnpm test`). UI tests use `src/test/fake-api.ts`, which runs the real
  `server/query.ts` over the fixture data, so expected counts come from `src/data/pokemon.json`.

## Verify before you say it works

```bash
pnpm install && pnpm lint && pnpm test && pnpm build   # lint, tests, typecheck, client + server bundles
pnpm start                                             # prod server on :3000
curl -fsS localhost:3000/api/health && curl -fsS 'localhost:3000/api/pokemon?limit=1'
cd infra && pnpm install && pnpm types                 # Pulumi typecheck
```

pnpm is pinned via `packageManager` (11.x). pnpm 11 ignores `pnpm.*` build settings in `package.json`; build-script
approvals live in each project's `pnpm-workspace.yaml` (`allowBuilds`).
