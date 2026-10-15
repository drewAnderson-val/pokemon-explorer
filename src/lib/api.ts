import {
  PAGE_SIZE,
  type PokemonPage,
  type PokemonType,
  type SortKey
} from './pokemon'

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

  const response = await fetch(`/api/pokemon?${params}`, { signal })
  if (!response.ok) {
    throw new Error(`Pokemon request failed (${response.status})`)
  }
  return (await response.json()) as PokemonPage
}
