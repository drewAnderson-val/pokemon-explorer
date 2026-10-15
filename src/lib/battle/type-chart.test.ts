import { describe, expect, it } from 'vitest'

import { POKEMON_TYPES } from '../pokemon'
import { effectiveness, typeMultiplier } from './type-chart'

describe('typeMultiplier', () => {
  it('has the standard number of 2x, 0.5x and 0x matchups', () => {
    const counts = { 0: 0, 0.5: 0, 1: 0, 2: 0 }
    for (const attack of POKEMON_TYPES) {
      for (const defend of POKEMON_TYPES) {
        counts[typeMultiplier(attack, defend)] += 1
      }
    }
    expect(counts).toEqual({ 0: 8, 0.5: 61, 1: 18 * 18 - 8 - 61 - 51, 2: 51 })
  })

  it.each([
    ['Normal', 'Ghost'],
    ['Fighting', 'Ghost'],
    ['Poison', 'Steel'],
    ['Ground', 'Flying'],
    ['Electric', 'Ground'],
    ['Psychic', 'Dark'],
    ['Ghost', 'Normal'],
    ['Dragon', 'Fairy']
  ] as const)('%s does nothing to %s', (attack, defend) => {
    expect(typeMultiplier(attack, defend)).toBe(0)
  })

  it.each([
    ['Water', 'Fire', 2],
    ['Fire', 'Water', 0.5],
    ['Fairy', 'Dragon', 2],
    ['Steel', 'Fairy', 2],
    ['Bug', 'Fairy', 0.5],
    ['Ice', 'Dragon', 2],
    ['Grass', 'Steel', 0.5],
    ['Normal', 'Fire', 1],
    ['Dark', 'Ghost', 2],
    ['Ghost', 'Dark', 0.5]
  ] as const)('%s vs %s is %sx', (attack, defend, expected) => {
    expect(typeMultiplier(attack, defend)).toBe(expected)
  })
})

describe('effectiveness', () => {
  it('multiplies both defender types', () => {
    expect(effectiveness('Fire', ['Grass', 'Steel'])).toBe(4)
    expect(effectiveness('Fire', ['Water', 'Dragon'])).toBe(0.25)
    expect(effectiveness('Ice', ['Fire', 'Dragon'])).toBe(1)
    expect(effectiveness('Electric', ['Water', 'Ground'])).toBe(0)
  })

  it('treats a single type and unknown names sensibly', () => {
    expect(effectiveness('Water', ['Fire'])).toBe(2)
    expect(effectiveness('Water', ['Fire', 'Mystery'])).toBe(2)
    expect(effectiveness('Water', [])).toBe(1)
  })
})
