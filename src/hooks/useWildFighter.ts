import { useQuery } from '@tanstack/react-query'

import { CreatureNotFoundError, fetchRandomPokemon } from '@/lib/api'
import { createFighter, type Rng, wildLevel } from '@/lib/battle/engine'
import { makeUid } from '@/lib/team/team'

type Options = {
  enabled: boolean
  excludeIds: number[]
  levels: number[]
  rng: Rng
  round: number
}

// A random wild creature near the team's level, never one already on it.
// `round` keys it, so "Battle again" draws a new one; levels and the team are
// read when the round starts.
export function useWildFighter({
  enabled,
  excludeIds,
  levels,
  rng,
  round
}: Options) {
  return useQuery({
    enabled,
    gcTime: 0,
    queryFn: async ({ signal }) => {
      const creature = await fetchRandomPokemon(excludeIds, rng, signal)
      return createFighter(creature, wildLevel(levels, rng), {
        uid: `wild-${makeUid()}`
      })
    },
    queryKey: ['battle', 'wild', round],
    retry: (failures, error) =>
      !(error instanceof CreatureNotFoundError) && failures < 1,
    staleTime: Infinity
  })
}
