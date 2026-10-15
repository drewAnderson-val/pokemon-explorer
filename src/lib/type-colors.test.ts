import { describe, expect, it } from 'vitest'

import { TYPE_COLORS, typeStyle, typeTextColor } from './type-colors'

const INK = '#2b2b2b'
const WHITE = '#ffffff'

// Text column from the spec's type color table.
const expectedText = {
  Bug: INK,
  Dark: WHITE,
  Dragon: WHITE,
  Electric: INK,
  Fairy: INK,
  Fighting: WHITE,
  Fire: INK,
  Flying: INK,
  Ghost: WHITE,
  Grass: INK,
  Ground: INK,
  Ice: INK,
  Normal: INK,
  Poison: WHITE,
  Psychic: INK,
  Rock: INK,
  Steel: INK,
  Water: INK
}

describe('typeTextColor', () => {
  it.each(Object.entries(expectedText))('%s gets %s text', (type, text) => {
    expect(typeTextColor(TYPE_COLORS[type as keyof typeof TYPE_COLORS])).toBe(
      text
    )
  })
})

describe('typeStyle', () => {
  it('sets the type CSS variables', () => {
    expect(typeStyle('Ghost')).toEqual({
      '--type': '#705898',
      '--type-text': WHITE
    })
  })

  it('falls back to Normal for unknown types', () => {
    expect(typeStyle('Plasma')).toEqual({
      '--type': '#a8a878',
      '--type-text': INK
    })
  })
})
