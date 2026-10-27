import { describe, expect, it } from 'vitest'

import { stubFetch } from '@/test/fake-api'

import {
  CreatureNotFoundError,
  fetchPokemonById,
  fetchRandomPokemon
} from './api'

// The fixture has ids 1–1000 in order.
describe('fetchRandomPokemon', () => {
  it('never picks a creature that is excluded', async () => {
    stubFetch()
    // rng 0 is the first free slot: 1 and 2 are taken, so #3.
    expect((await fetchRandomPokemon([2, 1], () => 0)).id).toBe(3)
    // The last slot, skipping an excluded #1000.
    expect((await fetchRandomPokemon([1000], () => 0.9999)).id).toBe(999)
    expect((await fetchRandomPokemon([], () => 0.9999)).id).toBe(1000)
  })

  it('ignores excluded ids that are not on file', async () => {
    stubFetch()
    expect((await fetchRandomPokemon([5000, 1], () => 0)).id).toBe(2)
  })
})

describe('fetchPokemonById', () => {
  it('asks the API for that one creature', async () => {
    const fetchMock = stubFetch()
    expect((await fetchPokemonById(7)).id).toBe(7)
    const url = new URL(String(fetchMock.mock.calls[0][0]), 'http://localhost')
    expect(url.pathname).toBe('/api/pokemon/7')
  })

  it('rejects an unknown id', async () => {
    stubFetch()
    await expect(fetchPokemonById(5000)).rejects.toBeInstanceOf(
      CreatureNotFoundError
    )
  })
})
