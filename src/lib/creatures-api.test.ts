import { describe, expect, it } from 'vitest'

import { stubFetch } from '@/test/fake-api'
import { seedCreations } from '@/test/fake-server'
import { signIn } from '@/test/session'

import { CreatureNotFoundError } from './api'
import { fetchPokemonById } from './creatures-api'

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

  it('sends your token, so your own creature is found', async () => {
    signIn()
    const embercub = {
      attack: 80,
      defense: 70,
      description: 'A sleepy fox',
      generation: 10,
      height: 0.6,
      hp: 55,
      id: 1001,
      imageUrl: 'https://img.test/creatures/1001.png',
      name: 'Embercub',
      specialAttack: 90,
      specialDefense: 60,
      speed: 100,
      types: ['Fire' as const],
      weight: 9.5
    }
    seedCreations([embercub])
    stubFetch()
    expect(await fetchPokemonById(1001)).toEqual(embercub)
  })
})
