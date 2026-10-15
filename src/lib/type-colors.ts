import type { CSSProperties } from 'react'

import { isPokemonType, type PokemonType } from './pokemon'

export const TYPE_COLORS: Record<PokemonType, string> = {
  Bug: '#a8b820',
  Dark: '#705848',
  Dragon: '#7038f8',
  Electric: '#f8d030',
  Fairy: '#ee99ac',
  Fighting: '#c03028',
  Fire: '#f08030',
  Flying: '#a890f0',
  Ghost: '#705898',
  Grass: '#78c850',
  Ground: '#e0c068',
  Ice: '#98d8d8',
  Normal: '#a8a878',
  Poison: '#a040a0',
  Psychic: '#f85888',
  Rock: '#b8a038',
  Steel: '#b8b8d0',
  Water: '#6890f0'
}

const INK = '#2b2b2b'
const WHITE = '#ffffff'

// WCAG relative luminance of a #rrggbb color.
export function relativeLuminance(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  return (
    0.2126 * linear((n >> 16) & 255) +
    0.7152 * linear((n >> 8) & 255) +
    0.0722 * linear(n & 255)
  )
}

export function typeStyle(type: string) {
  const color = TYPE_COLORS[isPokemonType(type) ? type : 'Normal']
  return {
    '--type': color,
    '--type-text': typeTextColor(color)
  } as CSSProperties
}

// Spec rule: ink text above 0.18 luminance, otherwise white.
export function typeTextColor(hex: string) {
  return relativeLuminance(hex) > 0.18 ? INK : WHITE
}

function linear(channel: number) {
  const s = channel / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
