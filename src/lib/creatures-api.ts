import type { CreatureRequest } from './creature'
import type { Pokemon } from './pokemon'

import { CreatureNotFoundError } from './api'
import { authFetch } from './auth'

// Your Creature Lab creatures live on the server, under your account. Errors
// carry the API's message, which is written for people to read.

export async function createCreature(
  request: CreatureRequest
): Promise<Pokemon> {
  const response = await authFetch('/api/creatures', {
    body: JSON.stringify(request),
    headers: { 'content-type': 'application/json' },
    method: 'POST'
  })
  if (!response.ok) throw new Error(await errorMessage(response))
  return ((await response.json()) as { creature: Pokemon }).creature
}

// Already gone (404: deleted in another tab, say) counts as deleted.
export async function deleteCreature(id: number): Promise<void> {
  const response = await authFetch(`/api/creatures/${id}`, { method: 'DELETE' })
  if (!response.ok && response.status !== 404) {
    throw new Error(await errorMessage(response))
  }
}

// A catalog creature, or one of yours (the token says whose): anyone else's is
// "not found".
export async function fetchPokemonById(
  id: number,
  signal?: AbortSignal
): Promise<Pokemon> {
  const response = await authFetch(`/api/pokemon/${id}`, { signal })
  if (response.status === 404) {
    throw new CreatureNotFoundError(`No creature #${id}`)
  }
  if (!response.ok) {
    throw new Error(`Pokemon request failed (${response.status})`)
  }
  return (await response.json()) as Pokemon
}

export async function listCreations(): Promise<Pokemon[]> {
  const response = await authFetch('/api/creatures')
  if (!response.ok) throw new Error(await errorMessage(response))
  return ((await response.json()) as { data: Pokemon[] }).data
}

async function errorMessage(response: Response) {
  const body = (await response.json().catch(() => null)) as null | {
    error?: string
  }
  return body?.error ?? `Creature request failed (${response.status})`
}
