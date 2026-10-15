import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import type { Pokemon } from '@/lib/pokemon'

import {
  deleteCreation,
  loadCreations,
  saveCreation
} from '@/lib/creation-store'
import { type CreatedCreature, FIRST_CREATION_ID } from '@/lib/creature'

import { updateTeam } from './useTeam'
import { creatureQuery } from './useTeamCreatures'

const CREATIONS_KEY = ['creations']

// The query cache is the source of truth for the UI, so a card still shows for
// this visit if the browser refuses to store it (e.g. private mode).
export function useCreations() {
  const client = useQueryClient()
  const query = useQuery({
    queryFn: loadCreations,
    queryKey: CREATIONS_KEY,
    staleTime: Infinity
  })

  // Returns the new card's id at once (the UI animates it in the same render);
  // the IndexedDB write finishes in the background.
  const add = useCallback(
    (creature: CreatedCreature) => {
      const existing = client.getQueryData<Pokemon[]>(CREATIONS_KEY) ?? []
      const id = Math.max(FIRST_CREATION_ID - 1, ...existing.map(c => c.id)) + 1
      const saved = { ...creature, id }
      client.setQueryData<Pokemon[]>(CREATIONS_KEY, [saved, ...existing])
      // Ids are reused after a delete; the battle caches creatures by id forever.
      client.setQueryData(creatureQuery(id).queryKey, saved)
      saveCreation(saved).catch((error: unknown) =>
        console.warn('Could not save the custom card', error)
      )
      return id
    },
    [client]
  )

  const remove = useCallback(
    async (id: number) => {
      client.setQueryData<Pokemon[]>(CREATIONS_KEY, previous =>
        previous?.filter(c => c.id !== id)
      )
      client.removeQueries({ queryKey: creatureQuery(id).queryKey })
      // A deleted card leaves the team too, so battles never meet a ghost.
      updateTeam(team => team.filter(member => member.creatureId !== id))
      try {
        await deleteCreation(id)
      } catch (error) {
        console.warn('Could not delete the custom card', error)
      }
    },
    [client]
  )

  return {
    add,
    creations: query.data ?? [],
    isPending: query.isPending,
    remove
  }
}
