import { useQueries } from '@tanstack/react-query'

import type { Pokemon } from '@/lib/pokemon'
import type { TeamMember } from '@/lib/team/team'

import { CreatureNotFoundError, fetchPokemonById } from '@/lib/api'
import { getCreation } from '@/lib/creation-store'
import { isCustomId } from '@/lib/creature'

const retryUnlessMissing = (failures: number, error: Error) =>
  !(error instanceof CreatureNotFoundError) && failures < 1

export function creatureQuery(id: number) {
  return {
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      isCustomId(id) ? loadCreation(id) : fetchPokemonById(id, signal),
    queryKey: ['pokemon', 'by-id', id],
    retry: retryUnlessMissing,
    staleTime: Infinity
  }
}

// Creature data for every team member. An id that's no longer on file is
// "missing" (shown and removable), not an error that blocks the screen.
export function useTeamCreatures(team: readonly TeamMember[]) {
  const ids = [...new Set(team.map(member => member.creatureId))]
  const results = useQueries({ queries: ids.map(creatureQuery) })
  const creatures = new Map<number, Pokemon>()
  const missing = new Set<number>()
  let isError = false
  results.forEach((result, index) => {
    if (result.data) creatures.set(ids[index], result.data)
    else if (result.error instanceof CreatureNotFoundError) {
      missing.add(ids[index])
    } else if (result.isError) isError = true
  })
  return {
    creatures,
    isError,
    isPending: results.some(result => result.isPending),
    missing,
    retry: () => {
      for (const result of results) {
        if (result.isError) void result.refetch()
      }
    }
  }
}

// Custom cards from the Creature Lab live in this browser, not the API; a
// deleted one is "missing" like a catalog id that's gone.
async function loadCreation(id: number) {
  const creation = await getCreation(id)
  if (!creation) throw new CreatureNotFoundError(`No custom card #${id}`)
  return creation
}
