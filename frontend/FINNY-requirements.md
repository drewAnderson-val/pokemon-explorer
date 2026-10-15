# FINNY requirements — Pokemon Explorer

The frontend take-home for the FINNY Senior Product Engineer second round. Source of truth for
what to build; `README.md` in this folder is the original brief from FINNY.

## What gets evaluated

- **Functionality and coding best practices.** That's the stated focus.
- Followed by a call with two frontend engineers walking through the solution and **the
  decisions behind it**, so every non-obvious choice needs a reason we can explain.
- Libraries may be added. Designs are a guide, not a spec ("be as creative as you'd like").
- **Submission:** a link to a **public** repo. Keep the product take-home and any FINNY email
  material out of it.

## Requirements

1. **Searchable grid** of Pokemon.
2. **Infinite scroll**, not pagination: load in batches, fetch more automatically on scroll.
3. **Two card views:**
   - **Default:** name and type badges only.
   - **Expanded:** full stats, description and other details. Click to expand/collapse each
     card individually.
4. **Responsive** at all screen sizes.

## Stack (fixed by the starter)

React 19 + Vite 8, TypeScript, Tailwind CSS 4 + shadcn/ui, Express 5 API mounted as Vite
middleware in dev, pnpm.

## Current state

- **Done:** the API (`server/app.ts`) and the data (`src/data/pokemon.json`).
- **Not done:** all of the UI. `src/components/PokemonGrid.tsx` is a stub: an unwired search
  input and a placeholder label. It already has the `Pokemon` type and a type-to-color map
  (`getTypeColor`).

## API

`GET /api/pokemon?page=1&limit=20&search=fire`

- `page` defaults to 1, `limit` to 20.
- `search` is a case-insensitive substring match on name, any type, or description.
- Response: `{ data: Pokemon[], pagination: { page, limit, total, totalPages, hasNext, hasPrev } }`.
  Use `hasNext` to decide whether to fetch the next page.

## Data shape

1,000 Faker-generated records:

`id, name, types (1–2), hp, attack, defense, specialAttack, specialDefense, speed, height,
weight, generation (1–9), description, imageUrl, isLegendary?` (52 are legendary).

## Design (`design/`)

- Dark page, centred search bar ("Search for a creature..."), 5-column card grid on desktop,
  and an end-of-list pill: "No more creatures found."
- Card: image on top, name on a dark panel below.
- Expanded card: name, a 2×2 grid of HP / Attack / Defense / Speed, and "Abilities" chips.

**Where the design and the brief disagree. Follow the brief and say why on the call:**

- The design's default card has **no type badges**. The brief requires them.
- The design shows **Abilities**, which aren't in the data. Show what the data has instead:
  types, all six stats, height, weight, generation, legendary and description.

## Known traps in the starter

- **Don't run `node scripts/generate-pokemon.mjs`** (the README says to). It isn't seeded, so it
  overwrites the committed data with 1,000 new random records.
- **Names aren't unique** (835 unique of 1,000). Key and track cards by `id`, never `name`.
- **`imageUrl`s are random placeholder images** (Picsum/LoremFlickr) at odd sizes like
  3266×1298. They load slowly, don't match the creature and sometimes fail. Use a fixed aspect
  ratio, `loading="lazy"`, and a fallback.
- **Height and weight aren't rounded** (`11.570127…`). Format them for display.
- **The API doesn't validate input.** `page=0`, `page=abc` and very large `limit` values give
  nonsense results.
- **The README's `pnpm server` script and `server/index.ts` were missing from the starter.**
  Both have since been added for Cloud Run (see `docs/decisions.md`).
- **No tests yet.**

## Open decisions

Not settled yet. Record each in `docs/decisions.md` once decided.

- How to fetch data: TanStack Query `useInfiniteQuery` (proposed) or a hand-rolled hook.
- What triggers the next page: an IntersectionObserver sentinel (proposed) or a scroll
  listener.
- How cards expand: in place within the grid (as the design shows) or in a dialog/sheet.
- Search behaviour: debounce delay, keeping the term in the URL, and ignoring stale responses
  that arrive after newer ones.
- Whether to virtualize the grid. Probably not needed for 1,000 lazy-loaded cards.
- How much to test: Vitest for the API, React Testing Library for the grid.
