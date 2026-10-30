import { describe, expect, it } from 'vitest'

import { formatHeight, formatNumber, formatWeight } from './format'

describe('formatNumber', () => {
  it.each([
    [4, 'No.004'],
    [45, 'No.045'],
    [999, 'No.999'],
    [1000, 'No.1000']
  ])('%i → %s', (id, label) => {
    expect(formatNumber(id)).toBe(label)
  })
})

describe('height and weight', () => {
  it('rounds to one decimal', () => {
    expect(formatHeight(11.570127311360618)).toBe('11.6 m')
    expect(formatWeight(812)).toBe('812.0 kg')
  })
})
