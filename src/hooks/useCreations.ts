import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import type { Pokemon } from '@/lib/pokemon'

import { deleteCreature, listCreations } from '@/lib/creatures-api'
import { reloadTeam } from '@/lib/team/serverTeam'

import { useAuth } from './useAuth'
import { creatureQuery } from './useTeamCreatures'

// The signed-in user's Creature Lab creatures, from the API. Keyed by user, so
// switching accounts never shows the last one's cards.
export function useCreations() {
  const client = useQueryClient()
  const userId = useAuth()?.user.id ?? null
  const key = ['creations', userId]
  const query = useQuery({
    enabled: userId !== null,
    queryFn: listCreations,
    queryKey: key,
    staleTime: Infinity
  })

  // A creature the server just made: shown at once, newest first. Returns its id
  // (the UI deals it in the same render).
  const add = useCallback(
    (creature: Pokemon) => {
      client.setQueryData<Pokemon[]>(['creations', userId], previous => [
        creature,
        ...(previous ?? [])
      ])
      client.setQueryData(creatureQuery(creature.id).queryKey, creature)
      return creature.id
    },
    [client, userId]
  )

  // Gone from the list at once; back if the server refuses (the error says why,
  // e.g. it's locked into a friend match). The server takes it off the team too.
  const remove = useCallback(
    async (id: number) => {
      const creationsKey = ['creations', userId]
      const removed = client
        .getQueryData<Pokemon[]>(creationsKey)
        ?.find(c => c.id === id)
      client.setQueryData<Pokemon[]>(creationsKey, previous =>
        previous?.filter(c => c.id !== id)
      )
      try {
        await deleteCreature(id)
      } catch (error) {
        // Put back only this card: others may have been deleted meanwhile.
        if (removed) {
          client.setQueryData<Pokemon[]>(creationsKey, previous =>
            [...(previous ?? []), removed].sort((a, b) => b.id - a.id)
          )
        }
        throw error
      }
      client.removeQueries({ queryKey: creatureQuery(id).queryKey })
      reloadTeam()
    },
    [client, userId]
  )

  return {
    add,
    creations: query.data ?? [],
    isPending: query.isPending && userId !== null,
    remove
  }
}
