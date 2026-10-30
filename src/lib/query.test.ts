// @vitest-environment node
import { describe, expect, it } from 'vitest'

import pokemonData from '@/data/pokemon.json'
import { type Pokemon, totalStats } from '@/lib/pokemon'

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
    ['search', 'a'.repeat(101)],
    ['search', ['a', 'b']]
  ])('rejects %s=%s', (key, value) => {
    expect(parsePokemonQuery({ [key]: value }).ok).toBe(false)
  })

  it('accepts a search at the length cap', () => {
    expect(parse({ search: 'a'.repeat(100) }).search).toHaveLength(100)
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
    expect(queryPokemon(data, parse({ search: 'vel' })).pagination.total).toBe(
      36
    )
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
