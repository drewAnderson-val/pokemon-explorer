import { describe, expect, it } from 'vitest'

import { makeCreature, scriptedRng } from '@/test/battle'

import { captureChance, catchRate, shakeChecks } from './catch'

// makeCreature has 100 in every stat (total 600); spread a total evenly.
const withTotal = (total: number, legendary = false) =>
  makeCreature({
    attack: total / 6,
    defense: total / 6,
    hp: total / 6,
    isLegendary: legendary,
    specialAttack: total / 6,
    specialDefense: total / 6,
    speed: total / 6
  })

describe('catchRate', () => {
  it('runs from 255 for the weakest to 30 for the strongest', () => {
    expect(catchRate(withTotal(300))).toBe(255)
    expect(catchRate(withTotal(240))).toBe(255)
    expect(catchRate(withTotal(1070))).toBe(30)
    expect(catchRate(withTotal(1200))).toBe(30)
    expect(catchRate(withTotal(684))).toBe(142)
  })

  it('halves for legendaries', () => {
    expect(catchRate(withTotal(1070, true))).toBe(15)
  })
})

describe('captureChance', () => {
  it('is a third of the rate at full HP and the full rate near 0', () => {
    expect(captureChance(255, 90, 90)).toBeCloseTo(1 / 3)
    expect(captureChance(255, 0, 90)).toBe(1)
    expect(captureChance(30, 0, 90)).toBeCloseTo(30 / 255)
  })
})

describe('shakeChecks', () => {
  it('counts passed checks out of four', () => {
    expect(shakeChecks(1, scriptedRng(0.99, 0.99, 0.99, 0.99))).toBe(4)
    expect(shakeChecks(0, scriptedRng(0))).toBe(0)
    // p = 1/16 → each check passes at 0.5.
    expect(shakeChecks(1 / 16, scriptedRng(0.4, 0.4, 0.6))).toBe(2)
  })
})
