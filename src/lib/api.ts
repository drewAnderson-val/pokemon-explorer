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

export class CreatureNotFoundError extends Error {}

// Ids run 1…total with no gaps, so in id order creature N is on page N of a
// one-per-page listing. The id check makes a gap fail loudly instead of
// quietly returning a different creature.
export async function fetchPokemonById(id: number, signal?: AbortSignal) {
  const page = await fetchPokemonAt(id, signal)
  const found = page.data[0]
  if (found?.id !== id) throw new CreatureNotFoundError(`No creature #${id}`)
  return found
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

// A random creature not in `excludeIds` (the team), by position in id order.
export async function fetchRandomPokemon(
  excludeIds: readonly number[],
  rng: () => number,
  signal?: AbortSignal
) {
  const { pagination } = await fetchPokemonAt(1, signal)
  const total = pagination.total
  const taken = [...new Set(excludeIds)]
    .filter(id => id >= 1 && id <= total)
    .sort((a, b) => a - b)
  const free = total - taken.length
  if (free < 1) throw new CreatureNotFoundError('No other creature to battle')
  // Pick one of the free slots, then step over the taken ids below it.
  let position = 1 + Math.floor(rng() * free)
  for (const id of taken) if (id <= position) position += 1
  const found = (await fetchPokemonAt(position, signal)).data[0]
  if (!found) throw new CreatureNotFoundError(`No creature at #${position}`)
  return found
}

function fetchPokemonAt(position: number, signal?: AbortSignal) {
  return fetchPokemonPage({
    limit: 1,
    page: position,
    search: '',
    signal,
    sort: 'id',
    type: null
  })
}
