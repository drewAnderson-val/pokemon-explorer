# Battle Box UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Pokemon Explorer UI (explorer + landing page) in the "Battle Box" retro RPG style, with type filtering, sorting, infinite scroll and every edge-case state from the handoff spec.

**Architecture:** The Express API gains validated `type` and `sort` params (pure functions in `server/query.ts`, unit tested). The client fetches with TanStack Query `useInfiniteQuery` (keyed by search/type/sort, so stale searches are cancelled), loads more through an IntersectionObserver sentinel, and renders small presentational components built on a `DialogBox` base. Two screens, chosen by `location.pathname` (`/explore` → explorer, anything else → landing); navigation between them is a normal link, so no router dependency.

**Tech Stack:** React 19.2, Vite 8, TypeScript (strict), Tailwind v4 (`@theme` tokens), TanStack Query 5, Express 5, Vitest 5 + Testing Library + jsdom, `@fontsource/pixelify-sans`.

**Spec:** `docs/specs/2026-10-15-battle-box-handoff.md` (the handoff spec). Also read `frontend/FINNY-requirements.md` and `frontend/AGENTS.md` before starting.

## Global Constraints

- All commands run from `frontend/` unless stated. pnpm 11 is pinned; add packages with `pnpm add -E` (exact versions, matching the existing `package.json`).
- Lint is strict: `pnpm lint` (`eslint . --quiet`). Perfectionist sorts imports, object keys, JSX props and type members; run `pnpm lint:fix` and `pnpm exec prettier --write <files>` before every commit rather than hand-sorting. `no-console` allows only `debug`, `warn`, `error`.
- Prettier: no semicolons, single quotes, no trailing commas, `arrowParens: avoid`.
- Key cards by `id`, never `name` (names repeat). Never run `node scripts/generate-pokemon.mjs`.
- Light theme only. Colors from the spec, mapped onto shadcn variables in `src/globals.css`.
- Font: Pixelify Sans 400/500/700, fallback monospace.
- Copy is exact: "What will you look for?", "Name, type, or description", "But nothing appeared! Try another type.", "Clear filters", "More creatures appeared…", "That's every creature on file!", "The connection fled! Try again.", "Try again", "PRESS START", "Start exploring" (aria-label), legends "Filter by type" / "Sort by".
- Search debounce 250ms. Page size 20. Load-more trigger 600px before the viewport bottom. 10 skeletons on first load, 4 when loading more.
- Breakpoints: 1 col <480px, 2 cols 480–767, 3 cols 768–1023, 4 cols 1024–1535, 5 cols ≥1536.
- `prefers-reduced-motion: reduce` turns off every animation and transition.
- 44px minimum touch targets on phones (<480px).
- Keep it original: no official logos, character art or show frames.
- Commit messages: plain sentence style like the existing history (no `feat:` prefixes), ending with the `Co-Authored-By` trailer. Commit on `feat/battle-box-ui` only; don't push.

### Tailwind names for the spec's tokens

Tailwind v4 reserves some of the spec's token names for other things, so they map like this (record this table in `DESIGN.md` in Task 8):

| Spec token | Tailwind usage | Why |
| --- | --- | --- |
| `color-field`, `color-box`, `color-inset`, `color-ink`, `color-ink-muted`, `color-track`, `color-accent`, `color-focus`, `color-danger` | `bg-field`, `bg-box`, `bg-inset`, `text-ink`, `text-ink-muted`, `bg-track`, `bg-accent`, `ring`/`focus-ring`, `text-danger` | Aliases of the shadcn variables, so both names work |
| `font-display`, `font-heading`, `font-card-title`, `font-body-lg`, `font-body`, `font-label`, `font-caption` | `text-display`, `text-heading`, … `text-caption` | `font-*` is the font-family namespace in Tailwind |
| `font-pixel` | `font-pixel` | |
| `border-box`, `border-inset`, `border-tag` | `frame-box`, `frame-inset`, `frame-tag` (custom `@utility`) | `border-box` would collide with `border-{color}` for `--color-box` |
| `radius-box`, `radius-inset`, `radius-tag` | `rounded-box`, `rounded-inset`, `rounded-tag` | |
| `shadow-press` | `shadow-press` | |

### Deliberate deviations from the spec (log in `docs/decisions.md`, Task 8)

- **▼ prompt color:** `color-accent` yellow on white is about 1.5:1 and effectively invisible, so ▼ is ink on light boxes and accent on dark boxes.
- **Error copy is bold:** `color-danger` (#E04038) on white is 4.2:1, below 4.5:1 for 20px regular text. At 20px bold it counts as large text (3:1), so it passes.
- **Card "button":** the whole card is clickable through a "stretched button" (the name is a `<button aria-expanded aria-controls>` whose `::after` covers the card). If the whole card were a `<button>`, the stats and description would end up inside its accessible name, and block content inside `<button>` is invalid HTML.

## Review Focus

These failure modes are implied by the spec but are easy to miss. Each one gets a test in the task that owns the code:

1. **An older, slower search resolves after a newer one** (typing "fi" then "fire" on a slow connection): only "fire" results are shown and the older request is aborted. Test in Task 6.
2. **A tall viewport where the first page doesn't fill the screen:** the sentinel never *re*-enters view, so a naive observer stalls after page 1. It must keep loading until the screen is full or the list ends. Test in Task 6.
3. **The next page fails mid-scroll:** loaded cards stay, the error box appears, "Try again" fetches that same page once (no duplicates, no skipped page). Test in Task 6.
4. **`/` typed inside the search box or any other field:** it must type a slash, not be swallowed by the focus shortcut. Test in Task 5.
5. **Hand-edited or bad query params** (`page=0`, `page=abc`, `limit=10000`, `type=fire` in lowercase, `sort=bogus`, repeated `search`): a 400 with a message, or the canonical value, never nonsense pages. Test in Task 1.

---

## File Structure

```
frontend/
  vite.config.ts                     modify: Vitest config
  package.json                       modify: deps, test scripts
  index.html                         modify: title
  server/
    app.ts                           modify: use parse/query helpers
    query.ts                         create: parsePokemonQuery, queryPokemon (pure)
    query.test.ts                    create
    app.test.ts                      create: route-level test
  src/
    main.tsx                         modify: QueryClientProvider
    App.tsx                          modify: pathname → screen
    App.test.tsx                     create
    globals.css                      rewrite: tokens, utilities, keyframes, font
    lib/
      pokemon.ts                     create: types, POKEMON_TYPES, SORT_KEYS, totalStats
      type-colors.ts (+ .test.ts)    create: TYPE_COLORS, typeTextColor, typeStyle
      format.ts (+ .test.ts)         create: formatNumber, formatHeight, formatWeight, cardImageUrl
      api.ts                         create: fetchPokemonPage
    hooks/
      usePokemonPages.ts             create: usePokemonPages, useCatalogTotal
      useDebouncedValue.ts (+ test)  create
      useSlashToFocus.ts (+ test)    create
      useLoadMoreSentinel.ts         create
    components/
      ui/button.tsx                  create (shadcn location); delete ui/input.tsx
      DialogBox.tsx                  create
      TypeBadge.tsx                  create
      TypeFilterChip.tsx             create
      SortMenu.tsx                   create
      SearchField.tsx                create
      StatusBox.tsx                  create
      primitives.test.tsx            create: tests for the six above
      ArtPanel.tsx                   create
      HpBar.tsx                      create
      StatList.tsx                   create
      MetaRow.tsx                    create
      CreatureCard.tsx               create (+ CreatureCardSkeleton)
      CreatureCard.test.tsx          create
      PlayButton.tsx                 create
      LandingScene.tsx               create
      PokemonGrid.tsx                delete
    screens/
      ExplorerScreen.tsx (+ test)    create
      LandingScreen.tsx (+ test)     create
    test/
      setup.ts                       create: jest-dom, cleanup, IntersectionObserver mock
      intersection-observer.ts       create: controllable mock
      fake-api.ts                    create: fetch stub backed by server/query.ts
      render.tsx                     create: renderWithClient
docs/decisions.md, frontend/DESIGN.md, frontend/FINNY-requirements.md, AGENTS.md, frontend/AGENTS.md,
.github/workflows/deploy.yml         modify in Task 8
```

---

### Task 1: Test harness and API `type` / `sort` / validation

**Files:**
- Modify: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/server/app.ts`
- Create: `frontend/src/lib/pokemon.ts`, `frontend/server/query.ts`, `frontend/src/test/setup.ts`, `frontend/src/test/intersection-observer.ts`
- Test: `frontend/server/query.test.ts`, `frontend/server/app.test.ts`

**Interfaces:**
- Produces (`src/lib/pokemon.ts`): `type Pokemon`, `type Pagination`, `type PokemonPage = { data: Pokemon[]; pagination: Pagination }`, `POKEMON_TYPES` (readonly tuple of the 18 type names in spec order), `type PokemonType`, `SORT_KEYS = ['id', 'total', 'speed']`, `type SortKey`, `PAGE_SIZE = 20`, `isPokemonType(value: string): value is PokemonType`, `totalStats(p: Pokemon): number`.
- Produces (`server/query.ts`): `type PokemonQuery = { limit: number; page: number; search: string; sort: SortKey; type: PokemonType | null }`, `parsePokemonQuery(raw: Record<string, unknown>): { ok: true; query: PokemonQuery } | { ok: false; error: string }`, `queryPokemon(data: readonly Pokemon[], query: PokemonQuery): PokemonPage`, `MAX_LIMIT = 100`.
- Produces (`src/test/intersection-observer.ts`): `setIntersecting(value: boolean): void`. While `true`, every observed element reports as intersecting, both on `observe()` and immediately when the value flips.
- API contract: `GET /api/pokemon?page&limit&search&type&sort`. Invalid params → `400 { error }`. `type` is matched case-insensitively and must be one of the 18. `sort=total` and `sort=speed` are descending, ties broken by `id` ascending. Search semantics are unchanged (case-insensitive substring on name, any type, or description) and AND with `type`.

- [ ] **Step 1: Install test tooling**

```bash
cd frontend
pnpm add -DE vitest@5.0.5 jsdom@30.1.3 @testing-library/react@16.3.3 @testing-library/user-event@14.6.8 @testing-library/jest-dom@7.0.1
```

Add scripts to `package.json` (keep the others):

```json
"test": "vitest run",
"test:watch": "vitest",
```

- [ ] **Step 2: Configure Vitest in `vite.config.ts`**

```ts
/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vite'

import app from './server/app'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      configureServer(server) {
        server.middlewares.use(app)
      },
      name: 'api-server'
    }
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  test: {
    environment: 'jsdom',
    restoreMocks: true,
    setupFiles: ['./src/test/setup.ts'],
    unstubGlobals: true
  }
})
```

- [ ] **Step 3: Create the test setup and IntersectionObserver mock**

`src/test/intersection-observer.ts`:

```ts
type Observer = {
  callback: IntersectionObserverCallback
  elements: Set<Element>
  instance: IntersectionObserver
}

const observers = new Set<Observer>()
let intersecting = false

function notify(observer: Observer, element: Element) {
  observer.callback(
    [{ isIntersecting: intersecting, target: element } as IntersectionObserverEntry],
    observer.instance
  )
}

// jsdom has no IntersectionObserver. Tests flip `intersecting` to simulate the
// load-more sentinel entering or staying in view.
export class MockIntersectionObserver implements IntersectionObserver {
  readonly root = null
  readonly rootMargin = ''
  readonly thresholds = []
  #observer: Observer

  constructor(callback: IntersectionObserverCallback) {
    this.#observer = { callback, elements: new Set(), instance: this }
    observers.add(this.#observer)
  }

  disconnect() {
    this.#observer.elements.clear()
    observers.delete(this.#observer)
  }

  observe(element: Element) {
    this.#observer.elements.add(element)
    // Real observers report the initial state right after observe().
    queueMicrotask(() => {
      if (this.#observer.elements.has(element)) notify(this.#observer, element)
    })
  }

  takeRecords() {
    return []
  }

  unobserve(element: Element) {
    this.#observer.elements.delete(element)
  }
}

export function setIntersecting(value: boolean) {
  intersecting = value
  for (const observer of observers) {
    for (const element of observer.elements) notify(observer, element)
  }
}

export function resetIntersectionObservers() {
  intersecting = false
  observers.clear()
}
```

`src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

import {
  MockIntersectionObserver,
  resetIntersectionObservers
} from './intersection-observer'

globalThis.IntersectionObserver = MockIntersectionObserver

afterEach(() => {
  cleanup()
  resetIntersectionObservers()
})
```

- [ ] **Step 4: Create shared types in `src/lib/pokemon.ts`**

```ts
export type Pokemon = {
  attack: number
  defense: number
  description: string
  generation: number
  height: number
  hp: number
  id: number
  imageUrl: string
  isLegendary?: boolean
  name: string
  specialAttack: number
  specialDefense: number
  speed: number
  types: string[]
  weight: number
}

export type Pagination = {
  hasNext: boolean
  hasPrev: boolean
  limit: number
  page: number
  total: number
  totalPages: number
}

export type PokemonPage = { data: Pokemon[]; pagination: Pagination }

// Spec order (also the order of the filter chips).
export const POKEMON_TYPES = [
  'Normal',
  'Fire',
  'Water',
  'Electric',
  'Grass',
  'Ice',
  'Fighting',
  'Poison',
  'Ground',
  'Flying',
  'Psychic',
  'Bug',
  'Rock',
  'Ghost',
  'Dragon',
  'Dark',
  'Steel',
  'Fairy'
] as const

export type PokemonType = (typeof POKEMON_TYPES)[number]

export const SORT_KEYS = ['id', 'total', 'speed'] as const

export type SortKey = (typeof SORT_KEYS)[number]

export const PAGE_SIZE = 20

export function isPokemonType(value: string): value is PokemonType {
  return (POKEMON_TYPES as readonly string[]).includes(value)
}

export function totalStats(p: Pokemon) {
  return (
    p.hp + p.attack + p.defense + p.specialAttack + p.specialDefense + p.speed
  )
}
```

- [ ] **Step 5: Write the failing tests**

`server/query.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest'

import pokemonData from '../src/data/pokemon.json'
import { type Pokemon, totalStats } from '../src/lib/pokemon'
import { parsePokemonQuery, queryPokemon } from './query'

const data = pokemonData as Pokemon[]

function parse(raw: Record<string, unknown>) {
  const result = parsePokemonQuery(raw)
  if (!result.ok) throw new Error(result.error)
  return result.query
}

describe('parsePokemonQuery', () => {
  it('applies defaults', () => {
    expect(parse({})).toEqual({
      limit: 20,
      page: 1,
      search: '',
      sort: 'id',
      type: null
    })
  })

  it.each([
    ['page', '0'],
    ['page', 'abc'],
    ['page', '1.5'],
    ['limit', '0'],
    ['limit', '101'],
    ['sort', 'name'],
    ['type', 'Plasma'],
    ['search', ['a', 'b']]
  ])('rejects %s=%s', (key, value) => {
    expect(parsePokemonQuery({ [key]: value }).ok).toBe(false)
  })

  it('canonicalizes type case and trims search', () => {
    expect(parse({ search: '  fire ', type: 'fire' })).toMatchObject({
      search: 'fire',
      type: 'Fire'
    })
  })
})

describe('queryPokemon', () => {
  it('pages through the catalog', () => {
    const result = queryPokemon(data, parse({ page: '2' }))
    expect(result.data[0].id).toBe(21)
    expect(result.pagination).toEqual({
      hasNext: true,
      hasPrev: true,
      limit: 20,
      page: 2,
      total: 1000,
      totalPages: 50
    })
  })

  it('returns an empty last-plus-one page', () => {
    const result = queryPokemon(data, parse({ page: '51' }))
    expect(result.data).toEqual([])
    expect(result.pagination.hasNext).toBe(false)
  })

  it('keeps the original search semantics', () => {
    expect(queryPokemon(data, parse({ search: 'vel' })).pagination.total).toBe(36)
  })

  it('filters by exact type', () => {
    const result = queryPokemon(data, parse({ limit: '100', type: 'Fire' }))
    expect(result.pagination.total).toBe(71)
    expect(result.data.every(p => p.types.includes('Fire'))).toBe(true)
  })

  it('ANDs search with type', () => {
    const result = queryPokemon(
      data,
      parse({ limit: '100', search: 'ber', type: 'Steel' })
    )
    expect(result.data.length).toBeGreaterThan(0)
    for (const p of result.data) {
      expect(p.types).toContain('Steel')
      expect(
        [p.name, p.description, ...p.types].join(' ').toLowerCase()
      ).toContain('ber')
    }
  })

  it('sorts strongest first by total stats, ties by id', () => {
    const { data: page } = queryPokemon(
      data,
      parse({ limit: '100', sort: 'total' })
    )
    expect(page[0]).toMatchObject({ id: 339, name: 'Michaela' })
    for (let i = 1; i < page.length; i++) {
      const [a, b] = [page[i - 1], page[i]]
      expect(
        totalStats(a) > totalStats(b) ||
          (totalStats(a) === totalStats(b) && a.id < b.id)
      ).toBe(true)
    }
  })

  it('sorts fastest first', () => {
    const { data: page } = queryPokemon(data, parse({ sort: 'speed' }))
    expect(page[0]).toMatchObject({ id: 683, speed: 200 })
  })

  it('does not mutate the source data', () => {
    queryPokemon(data, parse({ sort: 'speed' }))
    expect(data[0].id).toBe(1)
  })
})
```

`server/app.test.ts`:

```ts
// @vitest-environment node
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import app from './app'

let server: Server
let base = ''

beforeAll(
  () =>
    new Promise<void>(resolve => {
      server = app.listen(0, () => {
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
        resolve()
      })
    })
)

afterAll(() => new Promise<void>(resolve => server.close(() => resolve())))

describe('GET /api/pokemon', () => {
  it('filters and sorts', async () => {
    const res = await fetch(`${base}/api/pokemon?type=fire&sort=speed&limit=5`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: { speed: number; types: string[] }[]
      pagination: { total: number }
    }
    expect(body.pagination.total).toBe(71)
    expect(body.data.every(p => p.types.includes('Fire'))).toBe(true)
  })

  it('rejects bad input with a 400', async () => {
    const res = await fetch(`${base}/api/pokemon?limit=10000`)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      error: 'limit must be an integer from 1 to 100'
    })
  })
})
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `pnpm test server`
Expected: FAIL, `Failed to resolve import "./query"`.

- [ ] **Step 7: Implement `server/query.ts`**

```ts
import {
  isPokemonType,
  PAGE_SIZE,
  type Pokemon,
  type PokemonPage,
  type PokemonType,
  SORT_KEYS,
  type SortKey,
  totalStats
} from '../src/lib/pokemon'

export const MAX_LIMIT = 100

export type PokemonQuery = {
  limit: number
  page: number
  search: string
  sort: SortKey
  type: null | PokemonType
}

type ParseResult = { error: string; ok: false } | { ok: true; query: PokemonQuery }

// Returns the fallback when absent, null when present but not a positive integer.
function positiveInt(raw: unknown, fallback: number) {
  if (raw === undefined || raw === '') return fallback
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null
  const value = Number(raw)
  return value >= 1 ? value : null
}

const fail = (error: string): ParseResult => ({ error, ok: false })

export function parsePokemonQuery(raw: Record<string, unknown>): ParseResult {
  const page = positiveInt(raw.page, 1)
  if (page === null) return fail('page must be a positive integer')

  const limit = positiveInt(raw.limit, PAGE_SIZE)
  if (limit === null || limit > MAX_LIMIT) {
    return fail(`limit must be an integer from 1 to ${MAX_LIMIT}`)
  }

  const rawSearch = raw.search ?? ''
  if (typeof rawSearch !== 'string') return fail('search must be a single string')
  const search = rawSearch.trim()

  const sort = raw.sort ?? 'id'
  if (!SORT_KEYS.some(key => key === sort)) {
    return fail(`sort must be one of ${SORT_KEYS.join(', ')}`)
  }

  let type: null | PokemonType = null
  if (raw.type !== undefined && raw.type !== '') {
    const wanted = typeof raw.type === 'string' ? raw.type.toLowerCase() : ''
    const canonical = wanted.charAt(0).toUpperCase() + wanted.slice(1)
    if (!isPokemonType(canonical)) return fail('type must be a known type')
    type = canonical
  }

  return { ok: true, query: { limit, page, search, sort: sort as SortKey, type } }
}

const comparators: Record<SortKey, (a: Pokemon, b: Pokemon) => number> = {
  id: (a, b) => a.id - b.id,
  speed: (a, b) => b.speed - a.speed || a.id - b.id,
  total: (a, b) => totalStats(b) - totalStats(a) || a.id - b.id
}

export function queryPokemon(
  data: readonly Pokemon[],
  { limit, page, search, sort, type }: PokemonQuery
): PokemonPage {
  const needle = search.toLowerCase()
  const matches = data.filter(
    p =>
      (type === null || p.types.includes(type)) &&
      (needle === '' ||
        p.name.toLowerCase().includes(needle) ||
        p.types.some(t => t.toLowerCase().includes(needle)) ||
        p.description.toLowerCase().includes(needle))
  )
  const sorted = matches.toSorted(comparators[sort])

  const total = sorted.length
  const totalPages = Math.ceil(total / limit)
  const start = (page - 1) * limit

  return {
    data: sorted.slice(start, start + limit),
    pagination: {
      hasNext: page < totalPages,
      hasPrev: page > 1,
      limit,
      page,
      total,
      totalPages
    }
  }
}
```

If `toSorted` fails typecheck (lib is `ES2020`), use `[...matches].sort(comparators[sort])` instead; don't change the tsconfig for this.

- [ ] **Step 8: Wire `server/app.ts`**

```ts
import express from 'express'

import pokemonData from '../src/data/pokemon.json'
import type { Pokemon } from '../src/lib/pokemon'
import { parsePokemonQuery, queryPokemon } from './query'

const pokemon = pokemonData as Pokemon[]

const app = express()

app.get('/api/pokemon', (req, res) => {
  const parsed = parsePokemonQuery(req.query)
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error })
    return
  }
  res.json(queryPokemon(pokemon, parsed.query))
})

export default app
```

- [ ] **Step 9: Run tests, lint, build**

Run: `pnpm test && pnpm lint:fix && pnpm exec prettier --write server src/lib src/test vite.config.ts && pnpm lint && pnpm build`
Expected: all tests pass (query 18, app 2); lint and build are clean.

- [ ] **Step 10: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml frontend/vite.config.ts frontend/server frontend/src/lib/pokemon.ts frontend/src/test
git commit -m "Validate API params and add type filter and sort

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Design tokens, font and pure helpers

**Files:**
- Rewrite: `frontend/src/globals.css`
- Modify: `frontend/index.html` (title), `frontend/package.json`
- Create: `frontend/src/lib/type-colors.ts`, `frontend/src/lib/format.ts`
- Test: `frontend/src/lib/type-colors.test.ts`, `frontend/src/lib/format.test.ts`

**Interfaces:**
- Consumes: `POKEMON_TYPES`, `PokemonType`, `isPokemonType` from Task 1.
- Produces: `TYPE_COLORS: Record<PokemonType, string>`, `relativeLuminance(hex: string): number`, `typeTextColor(hex: string): string` (returns `'#2b2b2b'` or `'#ffffff'`), `typeStyle(type: string): CSSProperties` (sets `--type` and `--type-text`; unknown types fall back to Normal), `formatNumber(id: number): string`, `formatHeight(m: number): string`, `formatWeight(kg: number): string`, `cardImageUrl(src: string): string`.
- Produces (CSS): the utilities in the Global Constraints table, plus `focus-ring`, `title-outline`, `sky-shadow`, the `xs` (480px) breakpoint, and the animations `animate-blink`, `animate-reveal`, `animate-pulse-soft`, `animate-bob`, `animate-drift` (reads `--drift-duration`), `animate-marquee`.

- [ ] **Step 1: Install the font**

```bash
pnpm add -E @fontsource/pixelify-sans@5.3.0
```

- [ ] **Step 2: Write the failing tests**

`src/lib/type-colors.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { TYPE_COLORS, typeStyle, typeTextColor } from './type-colors'

const INK = '#2b2b2b'
const WHITE = '#ffffff'

// Text column from the spec's type color table.
const expectedText = {
  Bug: INK,
  Dark: WHITE,
  Dragon: WHITE,
  Electric: INK,
  Fairy: INK,
  Fighting: WHITE,
  Fire: INK,
  Flying: INK,
  Ghost: WHITE,
  Grass: INK,
  Ground: INK,
  Ice: INK,
  Normal: INK,
  Poison: WHITE,
  Psychic: INK,
  Rock: INK,
  Steel: INK,
  Water: INK
}

describe('typeTextColor', () => {
  it.each(Object.entries(expectedText))('%s gets %s text', (type, text) => {
    expect(typeTextColor(TYPE_COLORS[type as keyof typeof TYPE_COLORS])).toBe(text)
  })
})

describe('typeStyle', () => {
  it('sets the type CSS variables', () => {
    expect(typeStyle('Ghost')).toEqual({ '--type': '#705898', '--type-text': WHITE })
  })

  it('falls back to Normal for unknown types', () => {
    expect(typeStyle('Plasma')).toEqual({ '--type': '#a8a878', '--type-text': INK })
  })
})
```

`src/lib/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { cardImageUrl, formatHeight, formatNumber, formatWeight } from './format'

describe('formatNumber', () => {
  it.each([
    [4, 'No.004'],
    [45, 'No.045'],
    [999, 'No.999'],
    [1000, 'No.1000']
  ])('%i → %s', (id, label) => {
    expect(formatNumber(id)).toBe(label)
  })
})

describe('height and weight', () => {
  it('rounds to one decimal', () => {
    expect(formatHeight(11.570127311360618)).toBe('11.6 m')
    expect(formatWeight(812)).toBe('812.0 kg')
  })
})

describe('cardImageUrl', () => {
  it('requests a card-sized picsum image and keeps the query', () => {
    expect(
      cardImageUrl('https://picsum.photos/seed/ps3GTyrI/1827/3861?grayscale&blur=8')
    ).toBe('https://picsum.photos/seed/ps3GTyrI/480/360?grayscale&blur=8')
  })

  it('requests a card-sized loremflickr image and keeps the lock', () => {
    expect(cardImageUrl('https://loremflickr.com/3266/1298?lock=27188')).toBe(
      'https://loremflickr.com/480/360?lock=27188'
    )
  })

  it('leaves other and invalid URLs alone', () => {
    expect(cardImageUrl('https://example.com/a.png')).toBe('https://example.com/a.png')
    expect(cardImageUrl('')).toBe('')
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm test src/lib`
Expected: FAIL, `Failed to resolve import "./type-colors"` and `"./format"`.

- [ ] **Step 4: Implement `src/lib/type-colors.ts`**

```ts
import type { CSSProperties } from 'react'

import { isPokemonType, type PokemonType } from './pokemon'

export const TYPE_COLORS: Record<PokemonType, string> = {
  Bug: '#a8b820',
  Dark: '#705848',
  Dragon: '#7038f8',
  Electric: '#f8d030',
  Fairy: '#ee99ac',
  Fighting: '#c03028',
  Fire: '#f08030',
  Flying: '#a890f0',
  Ghost: '#705898',
  Grass: '#78c850',
  Ground: '#e0c068',
  Ice: '#98d8d8',
  Normal: '#a8a878',
  Poison: '#a040a0',
  Psychic: '#f85888',
  Rock: '#b8a038',
  Steel: '#b8b8d0',
  Water: '#6890f0'
}

const INK = '#2b2b2b'
const WHITE = '#ffffff'

function linear(channel: number) {
  const s = channel / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

// WCAG relative luminance of a #rrggbb color.
export function relativeLuminance(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  return (
    0.2126 * linear((n >> 16) & 255) +
    0.7152 * linear((n >> 8) & 255) +
    0.0722 * linear(n & 255)
  )
}

// Spec rule: ink text above 0.18 luminance, otherwise white.
export function typeTextColor(hex: string) {
  return relativeLuminance(hex) > 0.18 ? INK : WHITE
}

export function typeStyle(type: string) {
  const color = TYPE_COLORS[isPokemonType(type) ? type : 'Normal']
  return { '--type': color, '--type-text': typeTextColor(color) } as CSSProperties
}
```

- [ ] **Step 5: Implement `src/lib/format.ts`**

```ts
export const formatNumber = (id: number) => `No.${String(id).padStart(3, '0')}`

export const formatHeight = (meters: number) => `${meters.toFixed(1)} m`

export const formatWeight = (kg: number) => `${kg.toFixed(1)} kg`

// Fixture images are Picsum/LoremFlickr URLs ending in /{width}/{height}, some
// ~4000px wide. Ask for a card-sized image instead.
export function cardImageUrl(src: string) {
  try {
    const url = new URL(src)
    url.pathname = url.pathname.replace(/\/\d+\/\d+$/, '/480/360')
    return url.toString()
  } catch {
    return src
  }
}
```

- [ ] **Step 6: Run the lib tests**

Run: `pnpm test src/lib`
Expected: PASS (18 + 2 type-color tests, 8 format tests).

- [ ] **Step 7: Rewrite `src/globals.css`**

Keep the existing `@theme inline` shadcn mapping block (all `--color-*: var(--*)` and `--radius-*` lines) as is, and append the aliases shown. Replace `:root`, delete the `.dark` block, and add the rest:

```css
@import 'tailwindcss';
@import 'tw-animate-css';
@import '@fontsource/pixelify-sans/400.css';
@import '@fontsource/pixelify-sans/500.css';
@import '@fontsource/pixelify-sans/700.css';

@custom-variant dark (&:is(.dark *));

@theme inline {
  /* existing shadcn mapping: keep every line that was here */

  /* Spec token names, aliased to the shadcn variables (one source of truth). */
  --color-field: var(--background);
  --color-box: var(--card);
  --color-inset: var(--secondary);
  --color-ink: var(--foreground);
  --color-ink-muted: var(--muted-foreground);
  --color-track: var(--muted);
  --color-focus: var(--ring);
  --color-danger: var(--destructive);
}

@theme {
  --breakpoint-xs: 30rem;
  --font-pixel: 'Pixelify Sans', ui-monospace, monospace;

  --color-rule: #8a8a8a;
  --color-hp-good: #48c050;
  --color-sky-top: #1b74da;
  --color-sky-2: #3c98ec;
  --color-sky-3: #7cc3f4;
  --color-sky-horizon: #bfe6fa;
  --color-hill-far: #9cc6ea;
  --color-hill-1: #7dc65a;
  --color-hill-2: #56ae3e;
  --color-hill-3: #3e9431;
  --color-title-outline: #1a3f7a;

  --radius-box: 12px;
  --radius-inset: 6px;
  --radius-tag: 4px;
  --shadow-press: 0 8px 0 #2b2b2b;

  --text-display: clamp(56px, 11vw, 132px);
  --text-display--line-height: 0.9;
  --text-heading: 28px;
  --text-heading--line-height: 1.1;
  --text-card-title: 19px;
  --text-card-title--line-height: 1.15;
  --text-body-lg: 20px;
  --text-body-lg--line-height: 1.4;
  --text-body: 17px;
  --text-body--line-height: 1.35;
  --text-label: 15px;
  --text-label--line-height: 1.1;
  --text-label--letter-spacing: 0.04em;
  --text-caption: 14px;
  --text-caption--line-height: 1.3;

  --animate-blink: blink 1s steps(1) infinite;
  --animate-reveal: reveal 240ms steps(4) both;
  --animate-pulse-soft: pulse-soft 1.5s ease-in-out infinite;
  --animate-bob: bob 2.4s ease-in-out infinite;
  --animate-drift: drift var(--drift-duration, 120s) linear infinite;
  --animate-marquee: marquee 40s linear infinite;

  @keyframes blink {
    50% {
      opacity: 0;
    }
  }
  @keyframes reveal {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }
  @keyframes pulse-soft {
    50% {
      opacity: 0.5;
    }
  }
  @keyframes bob {
    50% {
      transform: translateY(-6px);
    }
  }
  @keyframes drift {
    from {
      transform: translateX(-30vw);
    }
    to {
      transform: translateX(110vw);
    }
  }
  @keyframes marquee {
    to {
      transform: translateX(-50%);
    }
  }
}

:root {
  --radius: 12px;
  --background: #dce6ee;
  --foreground: #2b2b2b;
  --card: #ffffff;
  --card-foreground: #2b2b2b;
  --popover: #ffffff;
  --popover-foreground: #2b2b2b;
  --primary: #2b2b2b;
  --primary-foreground: #ffffff;
  --secondary: #f2f6f8;
  --secondary-foreground: #2b2b2b;
  --muted: #e8e8e8;
  --muted-foreground: #4a4a4a;
  --accent: #f8d030;
  --accent-foreground: #2b2b2b;
  --destructive: #e04038;
  --border: #2b2b2b;
  --input: #2b2b2b;
  --ring: #3060c8;
  /* keep the existing --chart-* and --sidebar-* lines unchanged */
}

/* Spec border tokens (border-box/inset/tag). Named frame-* because border-box
   would collide with the border-color utility for --color-box. */
@utility frame-box {
  border: 6px double var(--color-ink);
}
@utility frame-inset {
  border: 2px solid var(--color-ink);
}
@utility frame-tag {
  border: 2px solid var(--color-ink);
}
@utility focus-ring {
  outline: 3px solid var(--color-focus);
  outline-offset: 3px;
}
@utility title-outline {
  text-shadow:
    -4px -4px 0 var(--color-title-outline),
    0 -4px 0 var(--color-title-outline),
    4px -4px 0 var(--color-title-outline),
    4px 0 0 var(--color-title-outline),
    4px 4px 0 var(--color-title-outline),
    0 4px 0 var(--color-title-outline),
    -4px 4px 0 var(--color-title-outline),
    -4px 0 0 var(--color-title-outline),
    0 10px 0 var(--color-title-outline);
}
@utility sky-shadow {
  text-shadow:
    0 2px 0 var(--color-title-outline),
    2px 0 0 var(--color-title-outline),
    -2px 0 0 var(--color-title-outline),
    0 -2px 0 var(--color-title-outline);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background font-pixel text-body text-foreground;
  }
}

/* Spec: with reduced motion, every animation is off and state changes stay instant. */
@media (prefers-reduced-motion: reduce) {
  *,
  ::before,
  ::after {
    animation: none !important;
    transition: none !important;
  }
}
```

In `index.html` change `<title>Finny Frontend Interview</title>` to `<title>Pokemon Explorer</title>`.

- [ ] **Step 8: Verify**

Run: `pnpm test && pnpm lint:fix && pnpm exec prettier --write src/lib src/globals.css && pnpm lint && pnpm build`
Expected: PASS and a clean build. Then open http://localhost:5173 (dev server: `pnpm dev`); the stub page should now use Pixelify Sans on a #DCE6EE background.

- [ ] **Step 9: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml frontend/index.html frontend/src/globals.css frontend/src/lib
git commit -m "Battle Box design tokens, pixel font and display helpers

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Box, badge, chip, sort, search and status components

**Files:**
- Create: `frontend/src/components/DialogBox.tsx`, `ui/button.tsx`, `TypeBadge.tsx`, `TypeFilterChip.tsx`, `SortMenu.tsx`, `SearchField.tsx`, `StatusBox.tsx`
- Test: `frontend/src/components/primitives.test.tsx`

**Interfaces:**
- Consumes: `typeStyle` (Task 2), `PokemonType`, `SortKey` (Task 1), `cn` from `@/lib/utils`.
- Produces:
  - `DialogBox(props: ComponentProps<'div'> & { showMore?: boolean; tone?: 'dark' | 'default' })`
  - `Button(props: ComponentProps<'button'> & { variant?: 'primary' | 'secondary' })`
  - `TypeBadge({ type }: { type: string })`
  - `TypeFilterChip({ onPress, pressed, type }: { onPress: () => void; pressed: boolean; type: null | PokemonType })` (`null` = ALL)
  - `SortMenu({ onChange, value }: { onChange: (value: SortKey) => void; value: SortKey })`
  - `SearchField({ onChange, ref, value }: { onChange: (value: string) => void; ref?: Ref<HTMLInputElement>; value: string })`
  - `type StatusKind = 'empty' | 'end' | 'error' | 'loading'`; `StatusBox({ kind, onAction }: { kind: StatusKind; onAction?: () => void })`

- [ ] **Step 1: Write the failing tests** (`src/components/primitives.test.tsx`)

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { SortKey } from '@/lib/pokemon'

import { SearchField } from './SearchField'
import { SortMenu } from './SortMenu'
import { StatusBox } from './StatusBox'
import { TypeBadge } from './TypeBadge'
import { TypeFilterChip } from './TypeFilterChip'

describe('TypeBadge', () => {
  it('writes the type name and passes the type colors', () => {
    render(<TypeBadge type="Ghost" />)
    const badge = screen.getByText('Ghost')
    expect(badge.style.getPropertyValue('--type')).toBe('#705898')
    expect(badge.style.getPropertyValue('--type-text')).toBe('#ffffff')
  })
})

describe('TypeFilterChip', () => {
  it('is a toggle button labelled with the type', async () => {
    const onPress = vi.fn()
    render(<TypeFilterChip onPress={onPress} pressed={false} type="Fire" />)
    const chip = screen.getByRole('button', { name: 'Fire', pressed: false })
    await userEvent.click(chip)
    expect(onPress).toHaveBeenCalledOnce()
  })

  it('labels the empty type as All', () => {
    render(<TypeFilterChip onPress={() => {}} pressed type={null} />)
    expect(screen.getByRole('button', { name: 'All', pressed: true })).toBeInTheDocument()
  })
})

describe('SortMenu', () => {
  it('marks the selected option and reports changes', async () => {
    const onChange = vi.fn<(value: SortKey) => void>()
    render(<SortMenu onChange={onChange} value="id" />)
    expect(screen.getByRole('group', { name: 'Sort by' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'No.', pressed: true })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Strongest' }))
    expect(onChange).toHaveBeenCalledWith('total')
  })
})

describe('SearchField', () => {
  function Harness() {
    const [value, setValue] = useState('')
    return <SearchField onChange={setValue} value={value} />
  }

  it('has a real label and clears on Escape', async () => {
    render(<Harness />)
    const input = screen.getByLabelText('What will you look for?')
    expect(input).toHaveAttribute('placeholder', 'Name, type, or description')
    await userEvent.type(input, 'fire')
    expect(input).toHaveValue('fire')
    await userEvent.keyboard('{Escape}')
    expect(input).toHaveValue('')
  })
})

describe('StatusBox', () => {
  it('announces errors and retries', async () => {
    const onAction = vi.fn()
    render(<StatusBox kind="error" onAction={onAction} />)
    expect(screen.getByRole('alert')).toHaveTextContent('The connection fled! Try again.')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onAction).toHaveBeenCalledOnce()
  })

  it('offers to clear filters when empty', () => {
    render(<StatusBox kind="empty" onAction={() => {}} />)
    expect(screen.getByText('But nothing appeared! Try another type.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument()
  })

  it('shows end and loading copy with no action', () => {
    const { rerender } = render(<StatusBox kind="end" />)
    expect(screen.getByText("That's every creature on file!")).toBeInTheDocument()
    rerender(<StatusBox kind="loading" />)
    expect(screen.getByText('More creatures appeared…')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test src/components`
Expected: FAIL, `Failed to resolve import "./SearchField"`.

- [ ] **Step 3: Implement the components**

`src/components/DialogBox.tsx`:

```tsx
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

type DialogBoxProps = ComponentProps<'div'> & {
  showMore?: boolean
  tone?: 'dark' | 'default'
}

// The base "text box" most of the UI is built from.
export function DialogBox({
  children,
  className,
  showMore = false,
  tone = 'default',
  ...props
}: DialogBoxProps) {
  const dark = tone === 'dark'
  return (
    <div
      className={cn(
        'relative',
        dark
          ? 'rounded-inset bg-ink p-3.5 text-white'
          : 'frame-box rounded-box bg-box p-3.5 sm:p-5',
        showMore && 'pb-7',
        className
      )}
      {...props}
    >
      {children}
      {showMore && (
        <span
          aria-hidden
          // Accent ▼ is ~1.5:1 on white, so light boxes use ink (see decisions.md).
          className={cn(
            'absolute right-3 bottom-1 animate-blink text-body',
            dark ? 'text-accent' : 'text-ink'
          )}
        >
          ▼
        </span>
      )}
    </div>
  )
}
```

`src/components/ui/button.tsx`:

```tsx
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

const variants = {
  primary: 'bg-primary text-primary-foreground',
  secondary: 'frame-tag bg-box text-ink hover:bg-inset'
}

type ButtonProps = ComponentProps<'button'> & {
  variant?: keyof typeof variants
}

export function Button({ className, variant = 'primary', ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex h-11 items-center justify-center rounded-tag px-4 text-label font-bold uppercase focus-visible:focus-ring',
        variants[variant],
        className
      )}
      type="button"
      {...props}
    />
  )
}
```

`src/components/TypeBadge.tsx`:

```tsx
import { typeStyle } from '@/lib/type-colors'

export function TypeBadge({ type }: { type: string }) {
  return (
    <span
      className="inline-flex h-6 items-center rounded-tag frame-tag bg-(--type) px-2 text-[14px] font-bold text-(--type-text) uppercase"
      style={typeStyle(type)}
    >
      {type}
    </span>
  )
}
```

`src/components/TypeFilterChip.tsx`:

```tsx
import type { PokemonType } from '@/lib/pokemon'

import { typeStyle } from '@/lib/type-colors'
import { cn } from '@/lib/utils'

type TypeFilterChipProps = {
  onPress: () => void
  pressed: boolean
  type: null | PokemonType
}

export function TypeFilterChip({ onPress, pressed, type }: TypeFilterChipProps) {
  return (
    <button
      aria-pressed={pressed}
      className={cn(
        'inline-flex h-11 shrink-0 items-center gap-2 rounded-tag frame-tag px-3 text-label font-bold uppercase focus-visible:focus-ring xs:h-10',
        pressed ? 'bg-ink text-white' : 'bg-box hover:bg-inset'
      )}
      onClick={onPress}
      style={type ? typeStyle(type) : undefined}
      type="button"
    >
      {type && (
        <span aria-hidden className="size-2.5 border-2 border-ink bg-(--type)" />
      )}
      {type ?? 'All'}
    </button>
  )
}
```

`src/components/SortMenu.tsx`:

```tsx
import type { SortKey } from '@/lib/pokemon'

import { cn } from '@/lib/utils'

import { DialogBox } from './DialogBox'

const OPTIONS: { label: string; value: SortKey }[] = [
  { label: 'No.', value: 'id' },
  { label: 'Strongest', value: 'total' },
  { label: 'Fastest', value: 'speed' }
]

type SortMenuProps = { onChange: (value: SortKey) => void; value: SortKey }

export function SortMenu({ onChange, value }: SortMenuProps) {
  return (
    <DialogBox className="self-start py-1 sm:py-1">
      <fieldset className="flex flex-wrap items-center gap-x-4">
        <legend className="sr-only">Sort by</legend>
        <span aria-hidden className="text-label font-bold text-ink-muted uppercase">
          Sort
        </span>
        {OPTIONS.map(option => {
          const selected = option.value === value
          return (
            <button
              aria-pressed={selected}
              className={cn(
                'group inline-flex h-11 items-center gap-1 text-label uppercase focus-visible:focus-ring xs:h-10',
                selected ? 'font-bold' : 'font-medium'
              )}
              key={option.value}
              onClick={() => onChange(option.value)}
              type="button"
            >
              <span
                aria-hidden
                className={selected ? 'visible' : 'invisible group-hover:visible'}
              >
                ▶
              </span>
              {option.label}
            </button>
          )
        })}
      </fieldset>
    </DialogBox>
  )
}
```

`src/components/SearchField.tsx`:

```tsx
import { type Ref, useId } from 'react'

import { DialogBox } from './DialogBox'

type SearchFieldProps = {
  onChange: (value: string) => void
  ref?: Ref<HTMLInputElement>
  value: string
}

export function SearchField({ onChange, ref, value }: SearchFieldProps) {
  const id = useId()
  return (
    <DialogBox className="min-w-0 flex-1">
      <label className="block text-body-lg" htmlFor={id}>
        What will you look for?
      </label>
      <div className="mt-2 flex items-center gap-2">
        <span aria-hidden className="text-body-lg">
          ▶
        </span>
        <input
          autoComplete="off"
          className="w-full min-w-0 border-b-2 border-ink bg-transparent py-1 text-body-lg outline-none placeholder:text-ink-muted focus-visible:focus-ring"
          id={id}
          onChange={event => onChange(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Escape' && value !== '') {
              event.preventDefault()
              onChange('')
            }
          }}
          placeholder="Name, type, or description"
          ref={ref}
          type="search"
          value={value}
        />
        <kbd
          aria-hidden
          className="hidden rounded-tag frame-tag px-1.5 text-caption sm:inline"
        >
          /
        </kbd>
      </div>
    </DialogBox>
  )
}
```

`src/components/StatusBox.tsx`:

```tsx
import { cn } from '@/lib/utils'

import { DialogBox } from './DialogBox'
import { Button } from './ui/button'

export type StatusKind = 'empty' | 'end' | 'error' | 'loading'

const COPY: Record<StatusKind, string> = {
  empty: 'But nothing appeared! Try another type.',
  end: "That's every creature on file!",
  error: 'The connection fled! Try again.',
  loading: 'More creatures appeared…'
}

type StatusBoxProps = { kind: StatusKind; onAction?: () => void }

export function StatusBox({ kind, onAction }: StatusBoxProps) {
  return (
    <DialogBox
      className="mx-auto w-full max-w-xl text-center"
      role={kind === 'error' ? 'alert' : undefined}
      showMore={kind === 'empty' || kind === 'loading'}
    >
      {/* Error copy is bold: #E04038 on white needs large text (bold ≥18.66px) to pass. */}
      <p className={cn('text-body-lg', kind === 'error' && 'font-bold text-danger')}>
        {COPY[kind]}
      </p>
      {kind === 'empty' && onAction && (
        <Button className="mt-4" onClick={onAction}>
          Clear filters
        </Button>
      )}
      {kind === 'error' && onAction && (
        <Button className="mt-4" onClick={onAction} variant="secondary">
          Try again
        </Button>
      )}
    </DialogBox>
  )
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test src/components`
Expected: PASS (8 tests).

- [ ] **Step 5: Lint, format, commit**

```bash
pnpm lint:fix && pnpm exec prettier --write src/components && pnpm lint && pnpm types
git add frontend/src/components
git commit -m "Dialog box, type badge, filter chip, sort, search and status components

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Creature card

**Files:**
- Create: `frontend/src/components/ArtPanel.tsx`, `HpBar.tsx`, `StatList.tsx`, `MetaRow.tsx`, `CreatureCard.tsx`
- Test: `frontend/src/components/CreatureCard.test.tsx`

**Interfaces:**
- Consumes: `Pokemon`, `totalStats` (Task 1); `typeStyle`, `formatNumber`, `formatHeight`, `formatWeight`, `cardImageUrl` (Task 2); `TypeBadge`, `DialogBox` (Task 3).
- Produces:
  - `CreatureCard({ expanded, onToggle, pokemon }: { expanded: boolean; onToggle: (id: number) => void; pokemon: Pokemon })`: memoized, renders an `<li>`, so it must sit inside a `<ul>`.
  - `CreatureCardSkeleton()`: renders `<li aria-hidden data-skeleton>`.

- [ ] **Step 1: Write the failing tests** (`src/components/CreatureCard.test.tsx`)

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { Pokemon } from '@/lib/pokemon'

import { CreatureCard } from './CreatureCard'

const pokemon: Pokemon = {
  attack: 10,
  defense: 20,
  description: 'Sleeps in warm sand.',
  generation: 4,
  height: 3.44,
  hp: 80,
  id: 4,
  imageUrl: 'https://loremflickr.com/3266/1298?lock=1',
  isLegendary: true,
  name: 'Geovanni',
  specialAttack: 30,
  specialDefense: 40,
  speed: 50,
  types: ['Fire', 'Flying'],
  weight: 812
}

function renderCard(expanded: boolean, overrides: Partial<Pokemon> = {}) {
  const onToggle = vi.fn()
  render(
    <ul>
      <CreatureCard
        expanded={expanded}
        onToggle={onToggle}
        pokemon={{ ...pokemon, ...overrides }}
      />
    </ul>
  )
  return { button: screen.getByRole('button', { name: 'Geovanni' }), onToggle }
}

describe('CreatureCard', () => {
  it('shows the collapsed summary', () => {
    const { button } = renderCard(false)
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('No.004')).toBeInTheDocument()
    expect(screen.getByText('Fire')).toBeInTheDocument()
    expect(screen.getByText('Flying')).toBeInTheDocument()
    expect(screen.getByText('80/80')).toBeInTheDocument()
    expect(screen.getByText('Legend')).toBeInTheDocument()
    expect(screen.queryByText('Sleeps in warm sand.')).not.toBeInTheDocument()
  })

  it('toggles by id', async () => {
    const { button, onToggle } = renderCard(false)
    await userEvent.click(button)
    expect(onToggle).toHaveBeenCalledWith(4)
  })

  it('reveals stats, meta and description when expanded', () => {
    const { button } = renderCard(true)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    const details = document.getElementById(button.getAttribute('aria-controls')!)
    expect(details).toBeVisible()
    expect(screen.getByText('230')).toBeInTheDocument() // TOTAL incl. HP
    expect(screen.getByText('GEN 4')).toBeInTheDocument()
    expect(screen.getByText('3.4 m')).toBeInTheDocument()
    expect(screen.getByText('812.0 kg')).toBeInTheDocument()
    expect(screen.getByText('Sleeps in warm sand.')).toBeInTheDocument()
  })

  it('swaps a failed image for the letter fallback', () => {
    const { container } = render(
      <ul>
        <CreatureCard expanded={false} onToggle={() => {}} pokemon={pokemon} />
      </ul>
    )
    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).toBe('https://loremflickr.com/480/360?lock=1')
    fireEvent.error(img)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('G')).toBeInTheDocument()
  })

  it('treats a missing image and isLegendary as absent', () => {
    renderCard(false, { imageUrl: '', isLegendary: undefined, types: ['Water'] })
    expect(screen.getByText('G')).toBeInTheDocument()
    expect(screen.queryByText('Legend')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test CreatureCard`
Expected: FAIL, `Failed to resolve import "./CreatureCard"`.

- [ ] **Step 3: Implement the parts**

`src/components/ArtPanel.tsx`:

```tsx
import { useState } from 'react'

import { cardImageUrl, formatNumber } from '@/lib/format'
import { typeStyle } from '@/lib/type-colors'

type ArtPanelProps = {
  expanded: boolean
  legendary: boolean
  name: string
  number: number
  src: string
  type: string
}

export function ArtPanel({ expanded, legendary, name, number, src, type }: ArtPanelProps) {
  const [failed, setFailed] = useState(false)
  const showImage = src !== '' && !failed

  return (
    <div
      className="relative h-[140px] overflow-hidden rounded-inset frame-inset bg-inset"
      style={typeStyle(type)}
    >
      {showImage ? (
        // Fixture images are random placeholders, not the creature: decorative.
        <img
          alt=""
          className="size-full object-cover"
          decoding="async"
          height={360}
          loading="lazy"
          onError={() => setFailed(true)}
          src={cardImageUrl(src)}
          width={480}
        />
      ) : (
        <div aria-hidden className="flex size-full items-center justify-center">
          <div className="flex h-24 w-36 items-center justify-center rounded-[50%] bg-(--type)/33">
            <span className="text-[80px] leading-none font-bold text-(--type) [text-shadow:3px_3px_0_var(--color-ink)]">
              {name.charAt(0).toUpperCase()}
            </span>
          </div>
        </div>
      )}
      <span className="absolute top-1.5 left-1.5 rounded-tag bg-box/90 px-1.5 text-caption">
        {formatNumber(number)}
      </span>
      {legendary && (
        <span className="absolute top-1.5 right-1.5 rounded-tag frame-tag bg-accent px-1.5 text-label font-bold uppercase">
          Legend
        </span>
      )}
      <span
        aria-hidden
        className="absolute right-1.5 bottom-1.5 rounded-tag bg-ink px-1.5 text-label font-bold text-white uppercase"
      >
        {expanded ? '▲ Less' : '▼ More'}
      </span>
    </div>
  )
}
```

`src/components/HpBar.tsx`:

```tsx
// Always full: the app has no damage, the bar is flavour for the HP stat.
export function HpBar({ hp }: { hp: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="rounded-tag bg-ink px-1.5 text-label font-bold text-accent">HP</span>
      <span
        aria-hidden
        className="h-2.5 flex-1 overflow-hidden rounded-inset frame-inset bg-track"
      >
        <span className="block size-full bg-hp-good" />
      </span>
      <span className="text-caption">
        {hp}/{hp}
      </span>
    </div>
  )
}
```

`src/components/StatList.tsx`:

```tsx
import { type Pokemon, totalStats } from '@/lib/pokemon'

const ROWS = [
  ['Attack', 'attack'],
  ['Defense', 'defense'],
  ['Sp. Atk', 'specialAttack'],
  ['Sp. Def', 'specialDefense'],
  ['Speed', 'speed']
] as const

// Dotted leaders are drawn with ::after so <dl> only contains dt/dd.
const leader =
  "flex flex-1 items-baseline gap-2 uppercase after:flex-1 after:border-b-2 after:border-dotted after:border-rule after:content-['']"

export function StatList({ pokemon }: { pokemon: Pokemon }) {
  return (
    <dl className="text-body">
      {ROWS.map(([label, key]) => (
        <div className="flex items-baseline gap-2" key={key}>
          <dt className={leader}>{label}</dt>
          <dd className="font-bold">{pokemon[key]}</dd>
        </div>
      ))}
      <div className="mt-1.5 flex items-baseline justify-between border-t-2 border-ink pt-1.5">
        <dt className="font-bold uppercase">Total</dt>
        <dd className="font-bold">{totalStats(pokemon)}</dd>
      </div>
    </dl>
  )
}
```

`src/components/MetaRow.tsx`:

```tsx
import { formatHeight, formatWeight } from '@/lib/format'

type MetaRowProps = { generation: number; height: number; weight: number }

export function MetaRow({ generation, height, weight }: MetaRowProps) {
  const cells = [
    ['Generation', `GEN ${generation}`],
    ['Height', formatHeight(height)],
    ['Weight', formatWeight(weight)]
  ]
  return (
    <dl className="grid grid-cols-3 gap-2 text-center text-caption">
      {cells.map(([label, value]) => (
        <div className="rounded-tag frame-inset px-1 py-1.5" key={label}>
          <dt className="sr-only">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}
```

`src/components/CreatureCard.tsx`:

```tsx
import { memo } from 'react'

import type { Pokemon } from '@/lib/pokemon'

import { cn } from '@/lib/utils'

import { ArtPanel } from './ArtPanel'
import { DialogBox } from './DialogBox'
import { HpBar } from './HpBar'
import { MetaRow } from './MetaRow'
import { StatList } from './StatList'
import { TypeBadge } from './TypeBadge'

type CreatureCardProps = {
  expanded: boolean
  onToggle: (id: number) => void
  pokemon: Pokemon
}

// "Stretched button": the name is the real <button>, and its ::after covers
// the whole card so any click toggles it. Wrapping the card in a <button>
// would put stats and description into the button's accessible name.
export const CreatureCard = memo(function CreatureCard({
  expanded,
  onToggle,
  pokemon
}: CreatureCardProps) {
  const detailsId = `creature-${pokemon.id}-details`
  return (
    <li
      className={cn(
        'group relative flex flex-col gap-3 rounded-box frame-box bg-box p-3.5 has-[button:focus-visible]:focus-ring',
        expanded && 'xs:row-span-2'
      )}
    >
      <ArtPanel
        expanded={expanded}
        legendary={pokemon.isLegendary === true}
        name={pokemon.name}
        number={pokemon.id}
        src={pokemon.imageUrl}
        type={pokemon.types[0] ?? 'Normal'}
      />
      <h2 className="flex items-start gap-1 text-card-title font-bold uppercase">
        <span
          aria-hidden
          className="invisible group-hover:visible group-has-[button:focus-visible]:visible"
        >
          ▶
        </span>
        <button
          aria-controls={detailsId}
          aria-expanded={expanded}
          className="line-clamp-2 text-left uppercase outline-none after:absolute after:inset-0 after:rounded-box after:content-['']"
          onClick={() => onToggle(pokemon.id)}
          type="button"
        >
          {pokemon.name}
        </button>
      </h2>
      <div className="flex flex-wrap gap-1.5">
        {pokemon.types.map(type => (
          <TypeBadge key={type} type={type} />
        ))}
      </div>
      <HpBar hp={pokemon.hp} />
      <div
        className="flex animate-reveal flex-col gap-3"
        hidden={!expanded}
        id={detailsId}
      >
        {expanded && (
          <>
            <StatList pokemon={pokemon} />
            <MetaRow
              generation={pokemon.generation}
              height={pokemon.height}
              weight={pokemon.weight}
            />
            <DialogBox tone="dark">
              <p className="text-body">{pokemon.description}</p>
            </DialogBox>
          </>
        )}
      </div>
    </li>
  )
})

export function CreatureCardSkeleton() {
  return (
    <li
      aria-hidden
      className="flex flex-col gap-3 rounded-box frame-box bg-box p-3.5"
      data-skeleton
    >
      <span className="block h-[140px] animate-pulse-soft rounded-inset bg-inset" />
      <span className="block h-6 w-2/3 animate-pulse-soft rounded-tag bg-inset" />
      <span className="block h-6 w-1/3 animate-pulse-soft rounded-tag bg-inset" />
      <span className="block h-4 animate-pulse-soft rounded-tag bg-inset" />
    </li>
  )
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test CreatureCard`
Expected: PASS (5 tests).

- [ ] **Step 5: Lint, format, commit**

```bash
pnpm lint:fix && pnpm exec prettier --write src/components && pnpm lint && pnpm types
git add frontend/src/components
git commit -m "Creature card with art panel, HP bar, stats and skeleton

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Data fetching and input hooks

**Files:**
- Modify: `frontend/package.json`, `frontend/src/main.tsx`
- Create: `frontend/src/lib/api.ts`, `frontend/src/hooks/usePokemonPages.ts`, `useDebouncedValue.ts`, `useSlashToFocus.ts`, `useLoadMoreSentinel.ts`, `frontend/src/test/fake-api.ts`, `frontend/src/test/render.tsx`
- Test: `frontend/src/hooks/useDebouncedValue.test.ts`, `frontend/src/hooks/useSlashToFocus.test.tsx`

**Interfaces:**
- Consumes: `PokemonPage`, `PokemonType`, `SortKey`, `PAGE_SIZE` (Task 1); `parsePokemonQuery`, `queryPokemon` (Task 1, used only by the fake API).
- Produces:
  - `type PokemonFilters = { search: string; sort: SortKey; type: null | PokemonType }`
  - `fetchPokemonPage(args: PokemonFilters & { limit?: number; page: number; signal?: AbortSignal }): Promise<PokemonPage>` (throws on non-2xx)
  - `usePokemonPages(filters: PokemonFilters)` → TanStack `UseInfiniteQueryResult<InfiniteData<PokemonPage>>`
  - `useCatalogTotal()` → `UseQueryResult<number>`
  - `useDebouncedValue<T>(value: T, delayMs: number): T`
  - `useSlashToFocus(ref: RefObject<HTMLInputElement | null>): void`
  - `useLoadMoreSentinel({ enabled, onLoadMore }: { enabled: boolean; onLoadMore: () => void }): RefObject<HTMLDivElement | null>`
  - Test helpers: `stubFetch(handler?: (url: URL) => Promise<Response> | Response)` returns the `vi.fn` mock (honours `AbortSignal`); `apiResponse(url: URL): Response` (the real query logic over the fixture data); `renderWithClient(ui: ReactElement)` returns the RTL result plus `client`, with `retry: false`.

- [ ] **Step 1: Install TanStack Query**

```bash
pnpm add -E @tanstack/react-query@5.104.3
```

- [ ] **Step 2: Write the failing hook tests**

`src/hooks/useDebouncedValue.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useDebouncedValue } from './useDebouncedValue'

describe('useDebouncedValue', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('updates only after the value has been stable for the delay', () => {
    const { rerender, result } = renderHook(
      ({ value }) => useDebouncedValue(value, 250),
      { initialProps: { value: 'f' } }
    )
    rerender({ value: 'fi' })
    act(() => vi.advanceTimersByTime(200))
    rerender({ value: 'fir' })
    act(() => vi.advanceTimersByTime(200))
    expect(result.current).toBe('f')
    act(() => vi.advanceTimersByTime(50))
    expect(result.current).toBe('fir')
  })
})
```

`src/hooks/useSlashToFocus.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef } from 'react'
import { describe, expect, it } from 'vitest'

import { useSlashToFocus } from './useSlashToFocus'

function Harness() {
  const ref = useRef<HTMLInputElement>(null)
  useSlashToFocus(ref)
  return (
    <>
      <input aria-label="search" ref={ref} />
      <input aria-label="other" />
      <button type="button">elsewhere</button>
    </>
  )
}

describe('useSlashToFocus', () => {
  it('focuses the search input when / is pressed elsewhere', async () => {
    render(<Harness />)
    screen.getByRole('button').focus()
    await userEvent.keyboard('/')
    expect(screen.getByLabelText('search')).toHaveFocus()
    expect(screen.getByLabelText('search')).toHaveValue('')
  })

  it('types a slash while already in a field', async () => {
    render(<Harness />)
    await userEvent.type(screen.getByLabelText('other'), 'a/b')
    expect(screen.getByLabelText('other')).toHaveValue('a/b')
    await userEvent.type(screen.getByLabelText('search'), 'x/y')
    expect(screen.getByLabelText('search')).toHaveValue('x/y')
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm test src/hooks`
Expected: FAIL, `Failed to resolve import "./useDebouncedValue"`.

- [ ] **Step 4: Implement the hooks, API client and test helpers**

`src/hooks/useDebouncedValue.ts`:

```ts
import { useEffect, useState } from 'react'

export function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}
```

`src/hooks/useSlashToFocus.ts`:

```ts
import { type RefObject, useEffect } from 'react'

// `/` focuses search from anywhere, but never while typing in a field.
export function useSlashToFocus(ref: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))
      ) {
        return
      }
      event.preventDefault()
      ref.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [ref])
}
```

`src/hooks/useLoadMoreSentinel.ts`:

```ts
import { useEffect, useEffectEvent, useRef } from 'react'

type Options = { enabled: boolean; onLoadMore: () => void }

// Calls onLoadMore when the sentinel is within 600px of the viewport. The
// observer is recreated whenever `enabled` flips back on (after each page), and
// a new observer reports the current state immediately. So if the sentinel is
// still in view on a tall screen, loading continues instead of stalling.
export function useLoadMoreSentinel({ enabled, onLoadMore }: Options) {
  const ref = useRef<HTMLDivElement>(null)
  const loadMore = useEffectEvent(onLoadMore)

  useEffect(() => {
    const element = ref.current
    if (!enabled || !element) return
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) loadMore()
      },
      { rootMargin: '0px 0px 600px 0px' }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [enabled])

  return ref
}
```

`src/lib/api.ts`:

```ts
import { PAGE_SIZE, type PokemonPage, type PokemonType, type SortKey } from './pokemon'

export type PokemonFilters = {
  search: string
  sort: SortKey
  type: null | PokemonType
}

type FetchArgs = PokemonFilters & {
  limit?: number
  page: number
  signal?: AbortSignal
}

export async function fetchPokemonPage({
  limit = PAGE_SIZE,
  page,
  search,
  signal,
  sort,
  type
}: FetchArgs): Promise<PokemonPage> {
  const params = new URLSearchParams({
    limit: String(limit),
    page: String(page),
    sort
  })
  if (search) params.set('search', search)
  if (type) params.set('type', type)

  const response = await fetch(`/api/pokemon?${params}`, { signal })
  if (!response.ok) throw new Error(`Pokemon request failed (${response.status})`)
  return (await response.json()) as PokemonPage
}
```

`src/hooks/usePokemonPages.ts`:

```ts
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'

import { fetchPokemonPage, type PokemonFilters } from '@/lib/api'

// Keyed by the filters: a new search is a new query starting at page 1, and
// the old one is aborted (TanStack cancels unobserved queries that read `signal`).
export function usePokemonPages(filters: PokemonFilters) {
  return useInfiniteQuery({
    getNextPageParam: last =>
      last.pagination.hasNext ? last.pagination.page + 1 : undefined,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      fetchPokemonPage({ ...filters, page: pageParam, signal }),
    queryKey: ['pokemon', 'pages', filters]
  })
}

export function useCatalogTotal() {
  return useQuery({
    queryFn: ({ signal }) =>
      fetchPokemonPage({ limit: 1, page: 1, search: '', signal, sort: 'id', type: null }),
    queryKey: ['pokemon', 'catalog-total'],
    select: page => page.pagination.total,
    staleTime: Infinity
  })
}
```

`src/test/fake-api.ts`:

```ts
import { vi } from 'vitest'

import pokemonData from '@/data/pokemon.json'
import type { Pokemon } from '@/lib/pokemon'

import { parsePokemonQuery, queryPokemon } from '../../server/query'

type Handler = (url: URL) => Promise<Response> | Response

// The real API logic over the real fixture data, without a server.
export function apiResponse(url: URL): Response {
  const parsed = parsePokemonQuery(Object.fromEntries(url.searchParams))
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 })
  return Response.json(queryPokemon(pokemonData as Pokemon[], parsed.query))
}

export function stubFetch(handler: Handler = apiResponse) {
  const fetchMock = vi.fn(
    (input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const signal = init?.signal
        const abort = () =>
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        if (signal?.aborted) return abort()
        signal?.addEventListener('abort', abort, { once: true })
        Promise.resolve(handler(new URL(String(input), 'http://localhost'))).then(
          resolve,
          reject
        )
      })
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

export function searchParamOf(call: unknown[], key: string) {
  return new URL(String(call[0]), 'http://localhost').searchParams.get(key)
}
```

`src/test/render.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'

export function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  })
  return {
    client,
    ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
  }
}
```

`src/main.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './globals.css'
import App from './App'

// The catalog is static, so don't refetch every loaded page on window focus.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 5 * 60_000 }
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
)
```

- [ ] **Step 5: Run tests**

Run: `pnpm test`
Expected: PASS (all earlier tests plus 3 new hook tests).

- [ ] **Step 6: Lint, format, commit**

```bash
pnpm lint:fix && pnpm exec prettier --write src && pnpm lint && pnpm types
git add frontend/package.json frontend/pnpm-lock.yaml frontend/src
git commit -m "TanStack Query data hooks, debounce, slash-to-search and load-more sentinel

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Explorer screen

**Files:**
- Create: `frontend/src/screens/ExplorerScreen.tsx`
- Modify: `frontend/src/App.tsx` (temporarily render `ExplorerScreen`; Task 7 adds the landing route)
- Delete: `frontend/src/components/PokemonGrid.tsx`, `frontend/src/components/ui/input.tsx`
- Test: `frontend/src/screens/ExplorerScreen.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–5.
- Produces: `ExplorerScreen()`. The grid is `<ul aria-label="Creatures">`, the type fieldset has `id="types"`, and the result count is a polite live region.

- [ ] **Step 1: Write the failing tests** (`src/screens/ExplorerScreen.test.tsx`)

```tsx
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { apiResponse, searchParamOf, stubFetch } from '@/test/fake-api'
import { setIntersecting } from '@/test/intersection-observer'
import { renderWithClient } from '@/test/render'

import { ExplorerScreen } from './ExplorerScreen'

// Counts below come from the committed fixture data (src/data/pokemon.json).
const grid = () => screen.getByRole('list', { name: 'Creatures' })
const cardNames = () =>
  within(grid())
    .queryAllByRole('button')
    .map(button => button.textContent)
const searchInput = () => screen.getByLabelText('What will you look for?')

async function renderLoaded() {
  const user = userEvent.setup()
  const view = renderWithClient(<ExplorerScreen />)
  await waitFor(() => expect(cardNames()).toHaveLength(20))
  return { user, ...view }
}

describe('ExplorerScreen', () => {
  it('shows skeletons, then the first page and the catalog count', async () => {
    stubFetch()
    const { container } = renderWithClient(<ExplorerScreen />)
    expect(container.querySelectorAll('[data-skeleton]')).toHaveLength(10)
    expect(await screen.findByText('1000 creatures on file')).toBeInTheDocument()
    await waitFor(() => expect(cardNames()).toHaveLength(20))
    expect(cardNames()[0]).toBe('Geovanni')
    expect(container.querySelectorAll('[data-skeleton]')).toHaveLength(0)
  })

  it('debounces search and announces the result count', async () => {
    const fetchMock = stubFetch()
    const { user } = await renderLoaded()
    await user.type(searchInput(), 'vel')
    expect(await screen.findByText('36 results')).toBeInTheDocument()
    const searches = fetchMock.mock.calls
      .map(call => searchParamOf(call, 'search'))
      .filter(Boolean)
    expect(searches).toEqual(['vel'])
  })

  it('filters by a single type and clears with All', async () => {
    stubFetch()
    const { user } = await renderLoaded()
    await user.click(screen.getByRole('button', { name: 'Fire' }))
    expect(screen.getByRole('button', { name: 'Fire', pressed: true })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All', pressed: false })).toBeInTheDocument()
    expect(await screen.findByText('71 results')).toBeInTheDocument()
    for (const card of within(grid()).getAllByRole('listitem')) {
      expect(within(card).getByText('Fire')).toBeInTheDocument()
    }
    await user.click(screen.getByRole('button', { name: 'All' }))
    await waitFor(() => expect(screen.queryByText(/results$/)).not.toBeInTheDocument())
  })

  it('sorts strongest first', async () => {
    stubFetch()
    const { user } = await renderLoaded()
    await user.click(screen.getByRole('button', { name: 'Strongest' }))
    await waitFor(() => expect(cardNames()[0]).toBe('Michaela'))
  })

  it('expands several cards independently', async () => {
    stubFetch()
    const { user } = await renderLoaded()
    const [first, second] = within(grid()).getAllByRole('button')
    await user.click(first)
    await user.click(second)
    expect(first).toHaveAttribute('aria-expanded', 'true')
    expect(second).toHaveAttribute('aria-expanded', 'true')
    await user.click(first)
    expect(first).toHaveAttribute('aria-expanded', 'false')
    expect(second).toHaveAttribute('aria-expanded', 'true')
  })

  it('keeps loading while the sentinel stays in view, then shows the end', async () => {
    stubFetch()
    const { user } = await renderLoaded()
    await user.type(searchInput(), 'ber')
    expect(await screen.findByText('67 results')).toBeInTheDocument()
    act(() => setIntersecting(true))
    expect(await screen.findByText("That's every creature on file!")).toBeInTheDocument()
    expect(cardNames()).toHaveLength(67)
  })

  it('shows the empty state and clears filters', async () => {
    stubFetch()
    const { user } = await renderLoaded()
    await user.type(searchInput(), 'zzzz')
    expect(
      await screen.findByText('But nothing appeared! Try another type.')
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(searchInput()).toHaveValue('')
    await waitFor(() => expect(cardNames()).toHaveLength(20))
  })

  it('keeps loaded cards when the next page fails and retries that page', async () => {
    let failNext = true
    const fetchMock = stubFetch(url => {
      if (url.searchParams.get('page') === '2' && failNext) {
        failNext = false
        return new Response('boom', { status: 500 })
      }
      return apiResponse(url)
    })
    const { user } = await renderLoaded()
    act(() => setIntersecting(true))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The connection fled! Try again.'
    )
    expect(cardNames()).toHaveLength(20)
    act(() => setIntersecting(false))
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(cardNames()).toHaveLength(40))
    const pages = fetchMock.mock.calls
      .filter(call => searchParamOf(call, 'limit') === '20')
      .map(call => searchParamOf(call, 'page'))
    expect(pages).toEqual(['1', '2', '2'])
  })

  it('retries a failed first page', async () => {
    let failNext = true
    stubFetch(url => {
      if (url.searchParams.get('limit') === '20' && failNext) {
        failNext = false
        return new Response('boom', { status: 500 })
      }
      return apiResponse(url)
    })
    const user = userEvent.setup()
    renderWithClient(<ExplorerScreen />)
    await user.click(await screen.findByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(cardNames()).toHaveLength(20))
  })

  it('ignores a slower response for an older search', async () => {
    const pending: (() => void)[] = []
    const fetchMock = stubFetch(url =>
      url.searchParams.get('search') === 'fi'
        ? new Promise<Response>(resolve => pending.push(() => resolve(apiResponse(url))))
        : apiResponse(url)
    )
    const { user } = await renderLoaded()
    await user.type(searchInput(), 'fi')
    await waitFor(() => expect(pending).toHaveLength(1))
    await user.type(searchInput(), 're')
    expect(await screen.findByText('71 results')).toBeInTheDocument()
    act(() => pending[0]())
    const olderCall = fetchMock.mock.calls.find(
      call => searchParamOf(call, 'search') === 'fi'
    )
    expect(olderCall?.[1]?.signal?.aborted).toBe(true)
    expect(screen.getByText('71 results')).toBeInTheDocument()
  })

  it('focuses search with /', async () => {
    stubFetch()
    const { user } = await renderLoaded()
    await user.keyboard('/')
    expect(searchInput()).toHaveFocus()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test ExplorerScreen`
Expected: FAIL, `Failed to resolve import "./ExplorerScreen"`.

- [ ] **Step 3: Implement `src/screens/ExplorerScreen.tsx`**

```tsx
import { useCallback, useMemo, useRef, useState } from 'react'

import { CreatureCard, CreatureCardSkeleton } from '@/components/CreatureCard'
import { DialogBox } from '@/components/DialogBox'
import { SearchField } from '@/components/SearchField'
import { SortMenu } from '@/components/SortMenu'
import { StatusBox, type StatusKind } from '@/components/StatusBox'
import { TypeFilterChip } from '@/components/TypeFilterChip'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useLoadMoreSentinel } from '@/hooks/useLoadMoreSentinel'
import { useCatalogTotal, usePokemonPages } from '@/hooks/usePokemonPages'
import { useSlashToFocus } from '@/hooks/useSlashToFocus'
import { POKEMON_TYPES, type PokemonType, type SortKey } from '@/lib/pokemon'
import { cn } from '@/lib/utils'

const SEARCH_DEBOUNCE_MS = 250
const FIRST_PAGE_SKELETONS = 10
const MORE_SKELETONS = 4

export function ExplorerScreen() {
  const [searchInput, setSearchInput] = useState('')
  const [type, setType] = useState<null | PokemonType>(null)
  const [sort, setSort] = useState<SortKey>('id')
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<number>>(() => new Set())

  const searchRef = useRef<HTMLInputElement>(null)
  useSlashToFocus(searchRef)

  const search = useDebouncedValue(searchInput.trim(), SEARCH_DEBOUNCE_MS)
  const catalogTotal = useCatalogTotal()
  const query = usePokemonPages({ search, sort, type })
  const { fetchNextPage, hasNextPage, isError, isFetchingNextPage, isPending } = query

  const pokemon = useMemo(
    () => query.data?.pages.flatMap(page => page.data) ?? [],
    [query.data]
  )
  const total = query.data?.pages[0]?.pagination.total
  const filtering = search !== '' || type !== null

  const sentinelRef = useLoadMoreSentinel({
    enabled: hasNextPage && !isFetchingNextPage && !isError,
    onLoadMore: () => void fetchNextPage()
  })

  const toggle = useCallback((id: number) => {
    setExpandedIds(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const clearFilters = () => {
    setSearchInput('')
    setType(null)
  }

  // A failed next page keeps the loaded cards; retry just that page.
  const retry = () => void (query.data ? fetchNextPage() : query.refetch())

  let status: null | StatusKind = null
  if (isError) status = 'error'
  else if (isPending) status = null
  else if (pokemon.length === 0) status = 'empty'
  else if (isFetchingNextPage) status = 'loading'
  else if (!hasNextPage) status = 'end'

  const skeletons = isPending ? FIRST_PAGE_SKELETONS : isFetchingNextPage ? MORE_SKELETONS : 0

  return (
    <main className="mx-auto flex max-w-[1400px] flex-col gap-5 px-4 pt-6 pb-16 xs:px-6 lg:px-14 lg:pt-12">
      <header className="flex flex-col gap-6 md:flex-row">
        <DialogBox className="shrink-0">
          <h1 className="text-heading font-bold uppercase">Explorer</h1>
          <p className="mt-1 text-caption text-ink-muted">
            {catalogTotal.data ?? '…'} creatures on file
          </p>
        </DialogBox>
        <SearchField onChange={setSearchInput} ref={searchRef} value={searchInput} />
      </header>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <fieldset className="min-w-0" id="types">
          <legend className="sr-only">Filter by type</legend>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 xs:mx-0 xs:flex-wrap xs:overflow-visible xs:px-0">
            <TypeFilterChip onPress={() => setType(null)} pressed={type === null} type={null} />
            {POKEMON_TYPES.map(option => (
              <TypeFilterChip
                key={option}
                onPress={() => setType(option)}
                pressed={type === option}
                type={option}
              />
            ))}
          </div>
        </fieldset>
        <SortMenu onChange={setSort} value={sort} />
      </div>

      <p aria-live="polite" className={cn('text-body text-ink-muted', !filtering && 'sr-only')}>
        {filtering && total !== undefined
          ? `${total} ${total === 1 ? 'result' : 'results'}`
          : ''}
      </p>

      <ul
        aria-label="Creatures"
        className="grid grid-flow-dense grid-cols-1 items-start gap-5 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5"
      >
        {pokemon.map(p => (
          <CreatureCard
            expanded={expandedIds.has(p.id)}
            key={p.id}
            onToggle={toggle}
            pokemon={p}
          />
        ))}
        {Array.from({ length: skeletons }, (_, index) => (
          // Placeholders have no identity; their position is their key.
          // eslint-disable-next-line @eslint-react/no-array-index-key
          <CreatureCardSkeleton key={index} />
        ))}
      </ul>

      <div aria-hidden ref={sentinelRef} />
      {status && (
        <StatusBox
          kind={status}
          onAction={status === 'error' ? retry : status === 'empty' ? clearFilters : undefined}
        />
      )}
    </main>
  )
}
```

If lint reports the disable comment as unused (the rule name differs in this plugin version), remove the comment and use `key={`skeleton-${index}`}` with whatever rule name the lint error prints.

`src/App.tsx` (temporary until Task 7):

```tsx
import { ExplorerScreen } from '@/screens/ExplorerScreen'

export default function App() {
  return <ExplorerScreen />
}
```

Delete the starter stub and the now-unused input:

```bash
git rm frontend/src/components/PokemonGrid.tsx frontend/src/components/ui/input.tsx
```

- [ ] **Step 4: Run tests**

Run: `pnpm test`
Expected: PASS, including all 11 ExplorerScreen tests. If the stale-search test fails because `aborted` is `false`, check that `queryFn` passes `signal` through to `fetch` (TanStack only cancels queries whose `signal` was read).

- [ ] **Step 5: Check it in the browser**

Run `pnpm dev` and open http://localhost:5173 at widths 375, 600, 900, 1280 and 1600 (Chrome DevTools device toolbar). Check:
- column counts are 1/2/3/4/5;
- header stacks below 768px;
- the sort menu sits below the chips below 1024px;
- chips scroll horizontally in one row below 480px;
- expanded cards span 2 rows (≥480px) and their neighbours fill in around them;
- ▶ shows on card hover and on keyboard focus with a blue ring;
- scrolling loads more with 4 skeletons and the "More creatures appeared…" box;
- picsum/loremflickr images load at 480×360 (Network tab);
- with DevTools → Rendering → "prefers-reduced-motion: reduce", nothing blinks or animates.

Fix anything off by adjusting class values only; note any numeric changes for `DESIGN.md` in Task 8.

- [ ] **Step 6: Lint, format, commit**

```bash
pnpm lint:fix && pnpm exec prettier --write src && pnpm lint && pnpm build
git add -A frontend/src
git commit -m "Explorer screen: search, type filter, sort, infinite scroll and status states

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Landing page and routing

**Files:**
- Create: `frontend/src/components/PlayButton.tsx`, `frontend/src/components/LandingScene.tsx`, `frontend/src/screens/LandingScreen.tsx`
- Modify: `frontend/src/App.tsx`
- Test: `frontend/src/screens/LandingScreen.test.tsx`, `frontend/src/App.test.tsx`

**Interfaces:**
- Consumes: `useCatalogTotal` (Task 5), `DialogBox`, `TypeBadge` (Task 3), `POKEMON_TYPES` (Task 1), `ExplorerScreen` (Task 6).
- Produces: `LandingScreen()`, `PlayButton({ href }: { href: string })`, `LandingScene()`. Routing: `App` renders `ExplorerScreen` when `location.pathname` starts with `/explore`, otherwise `LandingScreen`. Prod already serves `index.html` for every path (`server/index.ts` splat route) and Vite dev does SPA fallback.

- [ ] **Step 1: Write the failing tests**

`src/screens/LandingScreen.test.tsx`:

```tsx
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { stubFetch } from '@/test/fake-api'
import { renderWithClient } from '@/test/render'

import { LandingScreen } from './LandingScreen'

describe('LandingScreen', () => {
  it('has the wordmark, count and a play link into the explorer', async () => {
    stubFetch()
    renderWithClient(<LandingScreen />)
    expect(screen.getByRole('heading', { level: 1, name: 'Explorer' })).toBeInTheDocument()
    expect(screen.getByText('Finny · Pokemon')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Start exploring' })).toHaveAttribute(
      'href',
      '/explore'
    )
    expect(await screen.findByText('1000 creatures on file')).toBeInTheDocument()
  })

  it('tabs logo → Browse → Types → About → play, skipping scenery', () => {
    stubFetch()
    renderWithClient(<LandingScreen />)
    expect(screen.getAllByRole('link').map(link => link.getAttribute('aria-label') ?? link.textContent)).toEqual([
      'Pokemon Explorer home',
      'Browse',
      'Types',
      'About',
      'Start exploring'
    ])
  })
})
```

`src/App.test.tsx`:

```tsx
import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import App from './App'
import { stubFetch } from './test/fake-api'
import { renderWithClient } from './test/render'

afterEach(() => window.history.pushState({}, '', '/'))

describe('App', () => {
  it('renders the explorer at /explore', () => {
    window.history.pushState({}, '', '/explore')
    stubFetch()
    renderWithClient(<App />)
    expect(screen.getByLabelText('What will you look for?')).toBeInTheDocument()
  })

  it('renders the landing page everywhere else', () => {
    stubFetch()
    renderWithClient(<App />)
    expect(screen.getByRole('link', { name: 'Start exploring' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test LandingScreen App`
Expected: FAIL, `Failed to resolve import "./LandingScreen"`.

- [ ] **Step 3: Implement**

`src/components/PlayButton.tsx`:

```tsx
export function PlayButton({ href }: { href: string }) {
  return (
    <div className="flex flex-col items-center gap-4">
      {/* Bob on the link, scale on the inner circle, so the transforms don't fight. */}
      <a
        aria-label="Start exploring"
        className="group animate-bob rounded-full focus-visible:focus-ring"
        href={href}
      >
        <span className="flex size-[132px] items-center justify-center rounded-full border-[6px] border-ink bg-accent shadow-press transition-transform duration-120 ease-[steps(2)] group-hover:scale-106 group-active:scale-96">
          <svg aria-hidden className="ml-2 size-[52px] fill-ink" viewBox="0 0 13 13">
            {/* Stepped "pixel" play triangle. */}
            <path d="M2 0h2v1h2v1h2v1h2v1h2v1h1v3h-1v1h-2v1h-2v1h-2v1H4v1H2z" />
          </svg>
        </span>
      </a>
      <span aria-hidden className="animate-blink text-label font-bold text-white uppercase sky-shadow">
        Press start
      </span>
    </div>
  )
}
```

`src/components/LandingScene.tsx`:

```tsx
import type { CSSProperties } from 'react'

import { POKEMON_TYPES } from '@/lib/pokemon'

import { TypeBadge } from './TypeBadge'

const CLOUDS = [
  { delay: '-20s', duration: '110s', top: '12%', width: 140 },
  { delay: '-70s', duration: '150s', top: '22%', width: 96 },
  { delay: '-5s', duration: '90s', top: '34%', width: 120 },
  { delay: '-100s', duration: '130s', top: '8%', width: 72 }
]

const TREES = [
  { bottom: 150, left: '8%', scale: 1 },
  { bottom: 110, left: '78%', scale: 1.25 },
  { bottom: 95, left: '88%', scale: 0.9 }
]

function Cloud() {
  return (
    <svg className="w-full" fill="white" shapeRendering="crispEdges" viewBox="0 0 16 6">
      <path d="M4 0h5v1h2v1h3v1h2v3H0V3h1V2h3z" />
    </svg>
  )
}

function Tree() {
  return (
    <svg className="w-12" shapeRendering="crispEdges" viewBox="0 0 12 16">
      <path className="fill-hill-3 stroke-ink" d="M4 0h4v2h2v3h2v5h-2v2H2v-2H0V5h2V2h2z" strokeWidth="0.6" />
      <path className="fill-ink" d="M5 12h2v4H5z" />
    </svg>
  )
}

// Decorative only: hidden from assistive tech.
export function LandingScene() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,var(--color-sky-top)_0%,var(--color-sky-2)_38%,var(--color-sky-3)_68%,var(--color-sky-horizon)_100%)]" />
      {CLOUDS.map(cloud => (
        <div
          className="absolute left-0 animate-drift"
          key={cloud.top}
          style={
            {
              '--drift-duration': cloud.duration,
              animationDelay: cloud.delay,
              top: cloud.top,
              width: cloud.width
            } as CSSProperties
          }
        >
          <Cloud />
        </div>
      ))}
      <svg
        className="absolute inset-x-0 bottom-0 h-[360px] w-full"
        preserveAspectRatio="none"
        viewBox="0 0 1440 360"
      >
        <path className="fill-hill-far" d="M0 170C240 90 420 120 640 150S1080 80 1440 140V360H0Z" />
        <path className="fill-hill-1" d="M0 220C200 160 380 180 560 215S980 150 1440 210V360H0Z" />
        <path className="fill-hill-2" d="M0 270C260 220 520 250 760 280S1180 230 1440 260V360H0Z" />
        <path className="fill-hill-3" d="M0 315C320 285 640 300 900 320S1260 295 1440 310V360H0Z" />
      </svg>
      {TREES.map(tree => (
        <div
          className="absolute"
          key={tree.left}
          style={{ bottom: tree.bottom, left: tree.left, scale: tree.scale }}
        >
          <Tree />
        </div>
      ))}
      <div className="absolute inset-x-0 bottom-16 overflow-hidden">
        <div className="flex w-max animate-marquee gap-3">
          {[...POKEMON_TYPES, ...POKEMON_TYPES].map((type, index) => (
            // The list is duplicated for a seamless loop, so names repeat.
            // eslint-disable-next-line @eslint-react/no-array-index-key
            <TypeBadge key={`${type}-${index}`} type={type} />
          ))}
        </div>
      </div>
    </div>
  )
}
```

`src/screens/LandingScreen.tsx`:

```tsx
import { DialogBox } from '@/components/DialogBox'
import { LandingScene } from '@/components/LandingScene'
import { PlayButton } from '@/components/PlayButton'
import { useCatalogTotal } from '@/hooks/usePokemonPages'

export function LandingScreen() {
  const total = useCatalogTotal()
  const count = total.data ?? '…'

  return (
    <div className="relative isolate flex min-h-[max(100svh,900px)] flex-col">
      <LandingScene />

      <nav
        aria-label="Main"
        className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-4 px-4 py-6 text-white xs:px-6"
      >
        <a
          aria-label="Pokemon Explorer home"
          className="flex items-center gap-2 text-label font-bold uppercase sky-shadow focus-visible:focus-ring"
          href="/"
        >
          <span aria-hidden className="size-6 rounded-tag frame-tag bg-accent" />
          Explorer
        </a>
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-label font-bold uppercase sky-shadow">
          <li>
            <a className="focus-visible:focus-ring" href="/explore">
              Browse
            </a>
          </li>
          <li>
            <a className="focus-visible:focus-ring" href="/explore#types">
              Types
            </a>
          </li>
          <li>
            <a className="focus-visible:focus-ring" href="#about">
              About
            </a>
          </li>
        </ul>
      </nav>

      <main className="mx-auto flex w-full max-w-[900px] flex-col items-center gap-7 px-4 pt-8 pb-56 text-center">
        <p className="rounded-tag frame-tag bg-box px-2 py-0.5 text-label font-bold uppercase">
          {count} creatures on file
        </p>
        <div>
          <p className="mb-3 text-label font-bold text-white uppercase sky-shadow">
            Finny · Pokemon
          </p>
          <h1 className="text-display font-bold text-white uppercase title-outline">
            Explorer
          </h1>
        </div>
        <DialogBox className="w-full max-w-[560px] text-left" id="about" showMore>
          <p className="text-body-lg">
            A wild catalog appeared! Search {count} creatures by name, type or
            description, then open any card to see its stats.
          </p>
        </DialogBox>
        <PlayButton href="/explore" />
      </main>

      <p className="absolute inset-x-0 bottom-4 mx-auto w-fit max-w-[calc(100%-2rem)] rounded-tag bg-box/90 px-2 text-center text-caption">
        Fan-made demo. Creatures are randomly generated; not affiliated with any game company.
      </p>
    </div>
  )
}
```

`src/App.tsx`:

```tsx
import { ExplorerScreen } from '@/screens/ExplorerScreen'
import { LandingScreen } from '@/screens/LandingScreen'

// Two screens and plain links between them: a router would be overkill.
export default function App() {
  return window.location.pathname.startsWith('/explore') ? (
    <ExplorerScreen />
  ) : (
    <LandingScreen />
  )
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test`
Expected: PASS (all suites).

- [ ] **Step 5: Check it in the browser**

Open http://localhost:5173 at 375, 900 and 1440 widths. Check:
- the sky gradient and 4 hill layers span the full width;
- clouds drift and the badge marquee loops without a jump;
- the wordmark shrinks to 56px on phones and nav links wrap;
- the play button bobs, scales on hover/press, and goes to `/explore`;
- the footer is readable over the hills;
- Tab order is logo → Browse → Types → About → play.

- [ ] **Step 6: Lint, format, commit**

```bash
pnpm lint:fix && pnpm exec prettier --write src && pnpm lint && pnpm build
git add frontend/src
git commit -m "Landing page with sky scene, play button and pathname routing

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Docs, CI test step and full verification

**Files:**
- Modify: `docs/decisions.md`, `frontend/DESIGN.md`, `frontend/FINNY-requirements.md`, `AGENTS.md`, `frontend/AGENTS.md`, `.github/workflows/deploy.yml`

- [ ] **Step 1: Run tests in CI**

In `.github/workflows/deploy.yml`, in the frontend job, add `- run: pnpm test` between `- run: pnpm lint` and `- run: pnpm build`.

- [ ] **Step 2: Add `pnpm test` to the verify commands**

In the root `AGENTS.md` verify block, change the first line to:

```bash
cd frontend && pnpm install && pnpm lint && pnpm test && pnpm build   # lint, tests, typecheck, client + server bundles
```

In `frontend/AGENTS.md`, under Conventions, add:

```markdown
- Tests: Vitest + Testing Library (`pnpm test`). UI tests use `src/test/fake-api.ts`, which runs the real
  `server/query.ts` over the fixture data, so expected counts come from `src/data/pokemon.json`.
```

- [ ] **Step 3: Append to `docs/decisions.md`**

```markdown
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
  page, so a tall screen that the first page doesn't fill keeps loading instead of stalling.
- **Cards expand in place** (2 grid rows, `grid-auto-flow: dense`), as in the design, rather than in a dialog. The
  name is the real `<button aria-expanded aria-controls>` and its `::after` stretches over the card. Making the
  whole card a `<button>` would put the stats and description into its accessible name, and block content in a
  button is invalid HTML.
- **No router.** Two screens chosen by `location.pathname` (`/explore` vs everything else) with plain links between
  them. Prod already serves `index.html` for every path.
- **Not done (deliberately):** search/filter state in the URL, list virtualization (1,000 lazy-image cards render
  fine), dark theme (spec is light-only).
- **Spec adjustments:** ▼ prompts are ink on white boxes (accent yellow is ~1.5:1 there); error copy is bold so
  #E04038 on white passes as large text (it's 4.2:1); the spec's `font-*` sizes are `text-*` utilities and its
  `border-*` tokens are `frame-*` utilities (Tailwind namespaces, see `frontend/DESIGN.md`).
- **Fonts self-hosted** with `@fontsource/pixelify-sans` rather than Google Fonts: no third-party request and no
  layout shift from a late stylesheet.
- **Testing:** Vitest + Testing Library + jsdom. The fetch stub runs the real query code over the fixture data, so
  UI tests exercise real filtering and paging without a server.
```

- [ ] **Step 4: Update `frontend/DESIGN.md` and `frontend/FINNY-requirements.md`**

In `DESIGN.md`, append a section `## Implemented as` that links `docs/specs/2026-10-15-battle-box-handoff.md` as the detailed spec, and copy in the "Tailwind names for the spec's tokens" table and the "Deliberate deviations" list from this plan, plus any numbers changed during the browser checks in Tasks 6–7.

In `FINNY-requirements.md`:
- change **Current state** to say the UI is built (explorer + landing), with tests;
- replace the **Open decisions** list with one line: "Settled. See `docs/decisions.md` (2026-10-15: Battle Box UI)";
- in **Known traps**, replace "No tests yet." with "API input is validated in `server/query.ts`." and remove the trap that says "The API doesn't validate input".

- [ ] **Step 5: Full verification**

Run each command and paste the actual output into the PR description:

```bash
cd frontend && pnpm install --frozen-lockfile && pnpm lint && pnpm test && pnpm build
pnpm start &
curl -fsS localhost:3000/api/health
curl -fsS 'localhost:3000/api/pokemon?limit=1&type=fire&sort=speed'
curl -s -o /dev/null -w '%{http_code}\n' 'localhost:3000/api/pokemon?page=0'   # expect 400
curl -fsS -o /dev/null -w '%{http_code}\n' localhost:3000/explore             # expect 200 (SPA fallback)
kill %1
cd ../infra && pnpm install && pnpm types
```

Expected: lint clean, all tests pass, build succeeds, health `{"status":"ok"}`, one Fire creature JSON, `400`, `200`, infra types clean.

- [ ] **Step 6: Commit**

```bash
git add docs AGENTS.md frontend/AGENTS.md frontend/DESIGN.md frontend/FINNY-requirements.md .github/workflows/deploy.yml
git commit -m "Log Battle Box UI decisions, run tests in CI

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

Then use superpowers:finishing-a-development-branch to open the PR. The PR gets a preview environment from `deploy.yml`, so check the preview URL in the browser before asking for merge.
