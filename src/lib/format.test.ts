import { describe, expect, it } from 'vitest'

import {
  cardImageUrl,
  formatHeight,
  formatNumber,
  formatWeight
} from './format'

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

describe('cardImageUrl', () => {
  it('requests a card-sized picsum image and keeps the query', () => {
    expect(
      cardImageUrl(
        'https://picsum.photos/seed/ps3GTyrI/1827/3861?grayscale&blur=8'
      )
    ).toBe('https://picsum.photos/seed/ps3GTyrI/480/360?grayscale&blur=8')
  })

  // LoremFlickr is unreliable (HTTP 500s), so its links move to Picsum, seeded by
  // the lock so each creature keeps the same image on every load.
  it('swaps loremflickr for a picsum image seeded by the lock', () => {
    expect(cardImageUrl('https://loremflickr.com/3266/1298?lock=27188')).toBe(
      'https://picsum.photos/seed/lock-27188/480/360'
    )
  })

  it('leaves other and invalid URLs alone', () => {
    expect(cardImageUrl('https://example.com/a.png')).toBe(
      'https://example.com/a.png'
    )
    expect(cardImageUrl('')).toBe('')
  })
})
