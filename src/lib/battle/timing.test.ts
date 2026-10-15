import { describe, expect, it } from 'vitest'

import { barPosition, timingResult } from './timing'

describe('timingResult', () => {
  it.each([
    [0.5, 'perfect', 1.25],
    [0.45, 'perfect', 1.25],
    [0.56, 'nice', 1.1],
    [0.25, 'nice', 1.1],
    [0.75, 'nice', 1.1],
    [0.2, 'ok', 1],
    [0, 'ok', 1],
    [1, 'ok', 1]
  ] as const)('%s → %s (×%s)', (position, grade, bonus) => {
    expect(timingResult(position)).toEqual({ bonus, grade })
  })
})

describe('barPosition', () => {
  it('sweeps 0 → 1 → 0, one pass per period', () => {
    expect(barPosition(0, 600)).toBe(0)
    expect(barPosition(300, 600)).toBeCloseTo(0.5)
    expect(barPosition(600, 600)).toBeCloseTo(1)
    expect(barPosition(900, 600)).toBeCloseTo(0.5)
    expect(barPosition(1200, 600)).toBeCloseTo(0)
  })
})
