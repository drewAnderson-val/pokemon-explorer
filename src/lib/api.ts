import {
  PAGE_SIZE,
  type PokemonPage,
  type PokemonType,
  type SortKey
} from './pokemon'

// The FastAPI service. Empty in dev, where Vite proxies /api/pokemon to it; in
// prod the build sets it to the API's own origin.
export const API_BASE = import.meta.env.VITE_API_URL ?? ''

export type PokemonFilters = {
  search: string
  sort: SortKey
  type: null | PokemonType
}

type FetchArgs = PokemonFilters & {
  limit?: number
  page: number
  signal?: AbortSignal
}

export class CreatureNotFoundError extends Error {}

export async function fetchPokemonPage({
  limit = PAGE_SIZE,
  page,
  search,
  signal,
  sort,
  type
}: FetchArgs): Promise<PokemonPage> {
  const params = new URLSearchParams({
    limit: String(limit),
    page: String(page),
    sort
  })
  if (search) params.set('search', search)
  if (type) params.set('type', type)

  const response = await fetch(`${API_BASE}/api/pokemon?${params}`, { signal })
  if (!response.ok) {
    throw new Error(`Pokemon request failed (${response.status})`)
  }
  return (await response.json()) as PokemonPage
}
