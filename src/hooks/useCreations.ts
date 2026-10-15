import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import type { CreatedCreature } from '@/lib/creature'
import type { Pokemon } from '@/lib/pokemon'

import {
  deleteCreation,
  loadCreations,
  saveCreation
} from '@/lib/creation-store'

const CREATIONS_KEY = ['creations']

// Custom cards continue the catalog's numbering.
const FIRST_CREATION_ID = 1001

// The query cache is the source of truth for the UI, so a card still shows for
// this visit if the browser refuses to store it (e.g. private mode).
export function useCreations() {
  const client = useQueryClient()
  const query = useQuery({
    queryFn: loadCreations,
    queryKey: CREATIONS_KEY,
    staleTime: Infinity
  })

  const add = useCallback(
    async (creature: CreatedCreature) => {
      const existing = client.getQueryData<Pokemon[]>(CREATIONS_KEY) ?? []
      const id = Math.max(FIRST_CREATION_ID - 1, ...existing.map(c => c.id)) + 1
      const saved = { ...creature, id }
      client.setQueryData<Pokemon[]>(CREATIONS_KEY, [saved, ...existing])
      try {
        await saveCreation(saved)
      } catch (error) {
        console.warn('Could not save the custom card', error)
      }
    },
    [client]
  )

  const remove = useCallback(
    async (id: number) => {
      client.setQueryData<Pokemon[]>(CREATIONS_KEY, previous =>
        previous?.filter(c => c.id !== id)
      )
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
