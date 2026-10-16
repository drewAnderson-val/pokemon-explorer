// GET /api/summary: the landing page's numbers, from the real data.
export type CatalogSummary = {
  generations: number
  total: number
}

export type Pagination = {
  hasNext: boolean
  hasPrev: boolean
  limit: number
  page: number
  total: number
  totalPages: number
}

export type Pokemon = {
  attack: number
  defense: number
  description: string
  generation: number
  height: number
  hp: number
  id: number
  imageUrl: string
  isLegendary?: boolean
  name: string
  specialAttack: number
  specialDefense: number
  speed: number
  types: string[]
  weight: number
}

export type PokemonPage = { data: Pokemon[]; pagination: Pagination }

// Spec order (also the order of the filter chips).
export const POKEMON_TYPES = [
  'Normal',
  'Fire',
  'Water',
  'Electric',
  'Grass',
  'Ice',
  'Fighting',
  'Poison',
  'Ground',
  'Flying',
  'Psychic',
  'Bug',
  'Rock',
  'Ghost',
  'Dragon',
  'Dark',
  'Steel',
  'Fairy'
] as const

export type PokemonType = (typeof POKEMON_TYPES)[number]

export const SORT_KEYS = ['id', 'total', 'speed'] as const

export type SortKey = (typeof SORT_KEYS)[number]

export const PAGE_SIZE = 20

// Shared by the API (400 above it) and the search input (maxLength).
export const MAX_SEARCH_LENGTH = 100

export function isPokemonType(value: string): value is PokemonType {
  return (POKEMON_TYPES as readonly string[]).includes(value)
}

export function totalStats(p: Pokemon) {
  return (
    p.hp + p.attack + p.defense + p.specialAttack + p.specialDefense + p.speed
  )
}
