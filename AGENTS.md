# Pokemon Explorer: agent instructions

FINNY frontend take-home. Read by Claude Code (via `CLAUDE.md`), Codex, Cursor and other agents.
`frontend/AGENTS.md` and `infra/AGENTS.md` add rules for those folders.

## Ground rules

- **This repo is public.** Never commit interview correspondence, the product take-home, credentials or personal
  machine paths. Personal agent config goes in gitignored `CLAUDE.local.md` / `.claude/settings.local.json`.
- **Write decisions down.** When a choice between real alternatives is settled, append it to `docs/decisions.md`
  (date, what, why, what was rejected). Reviewers will ask about the reasoning, not just the code.
- **Say what's not done.** If a step is skipped or a check fails, report it with the actual output.
- **Ship through PRs.** `main` deploys to production on every push (`.github/workflows/deploy.yml`).

## Layout

| Path | What |
| --- | --- |
| `frontend/` | React 19 + Vite 8 SPA and Express 5 API (`server/app.ts`), one container in prod |
| `infra/` | Pulumi (TypeScript): app stack (CI-run) and `bootstrap/` stack (owner-run) |
| `docs/decisions.md` | Decision log |
| `docs/ai-usage.md` | How AI tools were used on this project |

## Verify before you say it works

```bash
cd frontend && pnpm install && pnpm lint && pnpm test && pnpm build   # lint, tests, typecheck, client + server bundles
pnpm start                                               # prod server on :3000
curl -fsS localhost:3000/api/health && curl -fsS 'localhost:3000/api/pokemon?limit=1'
cd ../infra && pnpm install && pnpm types                # Pulumi typecheck
```

pnpm is pinned via `packageManager` (11.x). pnpm 11 ignores `pnpm.*` build settings in `package.json`; build-script
approvals live in each folder's `pnpm-workspace.yaml` (`allowBuilds`).
