import type { CreatureRequest, CreatureResponse } from './creature'

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

// Errors carry the API's message, which is written for people to read.
export async function createCreature(
  request: CreatureRequest
): Promise<CreatureResponse> {
  const response = await fetch('/api/creatures', {
    body: JSON.stringify(request),
    headers: { 'content-type': 'application/json' },
    method: 'POST'
  })
  const body = (await response.json().catch(() => null)) as
    | CreatureResponse
    | null
    | { error?: string }
  if (!response.ok || !body || !('creature' in body)) {
    const message = body && 'error' in body ? body.error : undefined
    throw new Error(message ?? `Creature request failed (${response.status})`)
  }
  return body
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
