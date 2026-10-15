# Frontend: agent instructions

Before changing UI, read `FINNY-requirements.md` (what to build, data gotchas, open decisions) and `DESIGN.md`
(visual direction). `README.md` here is FINNY's original brief; don't edit it.

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

## Conventions

- Lint is strict (`eslint . --quiet`): `no-console` allows only `debug`, `warn` and `error`; imports are sorted by
  `perfectionist`. Prettier: no semicolons, single quotes, no trailing commas.
- `@/` aliases `src/`. UI primitives come from shadcn/ui in `src/components/ui/`.
