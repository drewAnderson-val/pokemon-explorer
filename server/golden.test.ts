// @vitest-environment node
// Records what the Express pokemon query returns for a fixed set of requests.
// The FastAPI tests (api/tests/test_pokemon_routes.py) check the new API against
// the same file, which is how the port is shown to behave identically.
// Regenerate with: UPDATE_GOLDEN=1 pnpm vitest run server/golden.test.ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, it } from 'vitest'

import pokemonData from '../src/data/pokemon.json'
import { parsePokemonQuery, queryPokemon } from './query'

const GOLDEN = path.resolve(
  __dirname,
  '../api/tests/golden/pokemon_queries.json'
)

const CASES: Record<string, string>[] = [
  {},
  { page: '2' },
  { page: '51' },
  { limit: '100' },
  { search: 'fire' },
  { search: '  FIRE ' },
  { search: '%' },
  { search: '_' },
  { limit: '7', page: '3', search: 'o' },
  { type: 'fire' },
  { search: 'a', type: 'Water' },
  { sort: 'total' },
  { page: '2', sort: 'total' },
  { page: '3', sort: 'total' },
  { sort: 'speed', type: 'Dragon' },
  { limit: '0' },
  { limit: '101' },
  { page: 'abc' },
  { sort: 'name' },
  { type: 'Plasma' },
  { search: 'a'.repeat(101) }
]

function answer(query: Record<string, string>) {
  const parsed = parsePokemonQuery(query)
  if (!parsed.ok) return { body: { error: parsed.error }, query, status: 400 }
  return {
    body: queryPokemon(pokemonData, parsed.query),
    query,
    status: 200
  }
}

it('matches the golden file', () => {
  const computed = CASES.map(answer)
  if (process.env.UPDATE_GOLDEN) {
    writeFileSync(GOLDEN, `${JSON.stringify(computed, null, 2)}\n`)
  }
  expect(existsSync(GOLDEN)).toBe(true)
  expect(computed).toEqual(JSON.parse(readFileSync(GOLDEN, 'utf8')))
})
