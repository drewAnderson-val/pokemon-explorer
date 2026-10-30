// @vitest-environment node
// The catalog search the UI tests' fake API runs (and the Explorer uses for your
// own creatures) must still answer like the real API. api/tests/golden/
// pokemon_queries.json is what the API answers; this replays it here. The file
// is fixed: the API is the source of truth.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, it } from 'vitest'

import pokemonData from '@/data/pokemon.json'

import { parsePokemonQuery, queryPokemon } from './query'

type Case = { body: unknown; query: Record<string, string>; status: number }

const GOLDEN = path.resolve(
  __dirname,
  '../../api/tests/golden/pokemon_queries.json'
)
const cases = JSON.parse(readFileSync(GOLDEN, 'utf8')) as Case[]

it.each(
  cases.map(c => [new URLSearchParams(c.query).toString() || 'defaults', c])
)('answers %s like the API', (_, { body, query, status }) => {
  const parsed = parsePokemonQuery(query)
  if (!parsed.ok) {
    expect(status).toBe(400)
    expect({ error: parsed.error }).toEqual(body)
    return
  }
  expect(status).toBe(200)
  expect(queryPokemon(pokemonData, parsed.query)).toEqual(body)
})
