import {
  type CatalogSummary,
  isPokemonType,
  MAX_SEARCH_LENGTH,
  PAGE_SIZE,
  type Pokemon,
  type PokemonPage,
  type PokemonType,
  SORT_KEYS,
  type SortKey,
  totalStats
} from '../src/lib/pokemon'

export const MAX_LIMIT = 100

export type PokemonQuery = {
  limit: number
  page: number
  search: string
  sort: SortKey
  type: null | PokemonType
}

type ParseResult =
  | { error: string; ok: false }
  | { ok: true; query: PokemonQuery }

// Returns the fallback when absent, null when present but not a positive integer.
function positiveInt(raw: unknown, fallback: number) {
  if (raw === undefined || raw === '') return fallback
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null
  const value = Number(raw)
  return value >= 1 ? value : null
}

const fail = (error: string): ParseResult => ({ error, ok: false })

export function parsePokemonQuery(raw: Record<string, unknown>): ParseResult {
  const page = positiveInt(raw.page, 1)
  if (page === null) return fail('page must be a positive integer')

  const limit = positiveInt(raw.limit, PAGE_SIZE)
  if (limit === null || limit > MAX_LIMIT) {
    return fail(`limit must be an integer from 1 to ${MAX_LIMIT}`)
  }

  const rawSearch = raw.search ?? ''
  if (typeof rawSearch !== 'string') {
    return fail('search must be a single string')
  }
  if (rawSearch.length > MAX_SEARCH_LENGTH) {
    return fail(`search must be at most ${MAX_SEARCH_LENGTH} characters`)
  }
  const search = rawSearch.trim()

  const sort = SORT_KEYS.find(key => key === (raw.sort ?? 'id'))
  if (!sort) return fail(`sort must be one of ${SORT_KEYS.join(', ')}`)

  let type: null | PokemonType = null
  if (raw.type !== undefined && raw.type !== '') {
    const wanted = typeof raw.type === 'string' ? raw.type.toLowerCase() : ''
    const canonical = wanted.charAt(0).toUpperCase() + wanted.slice(1)
    if (!isPokemonType(canonical)) return fail('type must be a known type')
    type = canonical
  }

  return { ok: true, query: { limit, page, search, sort, type } }
}

const comparators: Record<SortKey, (a: Pokemon, b: Pokemon) => number> = {
  id: (a, b) => a.id - b.id,
  speed: (a, b) => b.speed - a.speed || a.id - b.id,
  total: (a, b) => totalStats(b) - totalStats(a) || a.id - b.id
}

export function queryPokemon(
  data: readonly Pokemon[],
  { limit, page, search, sort, type }: PokemonQuery
): PokemonPage {
  const needle = search.toLowerCase()
  const matches = data.filter(
    p =>
      (type === null || p.types.includes(type)) &&
      (needle === '' ||
        p.name.toLowerCase().includes(needle) ||
        p.types.some(t => t.toLowerCase().includes(needle)) ||
        p.description.toLowerCase().includes(needle))
  )
  // filter() already returned a copy, so sorting in place is safe.
  const sorted = matches.sort(comparators[sort])

  const total = sorted.length
  const totalPages = Math.ceil(total / limit)
  const start = (page - 1) * limit

  return {
    data: sorted.slice(start, start + limit),
    pagination: {
      hasNext: page < totalPages,
      hasPrev: page > 1,
      limit,
      page,
      total,
      totalPages
    }
  }
}

export function summarizePokemon(data: readonly Pokemon[]): CatalogSummary {
  return {
    generations: new Set(data.map(p => p.generation)).size,
    total: data.length
  }
}
