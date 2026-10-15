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
