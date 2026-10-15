import type { Pokemon } from '@/lib/pokemon'

import { createFighter, type Fighter, type Rng } from '@/lib/battle/engine'

export function makeCreature(overrides: Partial<Pokemon> = {}): Pokemon {
  return {
    attack: 100,
    defense: 100,
    description: 'A test creature.',
    generation: 1,
    height: 1,
    hp: 100,
    id: 1,
    imageUrl: '',
    name: 'Testmon',
    specialAttack: 100,
    specialDefense: 100,
    speed: 100,
    types: ['Normal'],
    weight: 10,
    ...overrides
  }
}

export function makeFighter(
  overrides: Partial<Pokemon> = {},
  level = 50,
  extra: { hp?: number; uid?: string; xp?: number } = {}
): Fighter {
  return createFighter(makeCreature(overrides), level, {
    hp: extra.hp,
    uid: extra.uid ?? `uid-${overrides.id ?? 1}`,
    xp: extra.xp
  })
}

// Plays back fixed "random" numbers in order; fails loudly if a test
// consumes more than it scripted.
export function scriptedRng(...values: number[]): Rng {
  let index = 0
  return () => {
    if (index >= values.length) {
      throw new Error(`scriptedRng ran out after ${values.length} values`)
    }
    return values[index++]
  }
}
