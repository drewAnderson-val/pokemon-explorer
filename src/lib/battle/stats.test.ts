import { describe, expect, it } from 'vitest'

import { makeCreature } from '@/test/battle'

import {
  levelForXp,
  maxHpAt,
  statAt,
  statsAt,
  xpForLevel,
  xpGain,
  xpProgress
} from './stats'

describe('stat formulas', () => {
  it('come out at base + 5 (HP base + 60) at level 50', () => {
    expect(statAt(100, 50)).toBe(105)
    expect(maxHpAt(100, 50)).toBe(160)
  })

  it('scale with level', () => {
    expect(statAt(100, 5)).toBe(15)
    expect(maxHpAt(100, 5)).toBe(25)
    expect(statsAt(makeCreature({ speed: 200 }), 100).speed).toBe(405)
  })
})

describe('XP', () => {
  it('needs n³ total XP for level n', () => {
    expect(xpForLevel(5)).toBe(125)
    expect(levelForXp(0)).toBe(1)
    expect(levelForXp(215)).toBe(5)
    expect(levelForXp(216)).toBe(6)
    expect(levelForXp(10 ** 9)).toBe(100)
  })

  it('gains a quarter of total stats × level / 7', () => {
    // Total 600 → base 150; 150 × 5 / 7 = 107.
    expect(xpGain(makeCreature(), 5)).toBe(107)
  })

  it('reports progress through the current level', () => {
    expect(xpProgress(5, 125)).toBe(0)
    expect(xpProgress(5, 170)).toBeCloseTo(45 / 91)
    expect(xpProgress(100, 10 ** 6)).toBe(1)
  })
})
