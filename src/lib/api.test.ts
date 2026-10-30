import { describe, expect, it } from 'vitest'

import { stubFetch } from '@/test/fake-api'

import { fetchRandomPokemon } from './api'

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
