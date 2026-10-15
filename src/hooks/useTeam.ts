import { useSyncExternalStore } from 'react'

import { createLocalStore } from '@/lib/localStore'
import { parseTeam, serializeTeam, type TeamMember } from '@/lib/team/team'

export const TEAM_STORAGE_KEY = 'pokemon-explorer:team'

const EMPTY: TeamMember[] = []

const store = createLocalStore<TeamMember[]>({
  empty: EMPTY,
  key: TEAM_STORAGE_KEY,
  parse: parseTeam,
  serialize: serializeTeam
})

export const updateTeam = store.update

// The saved team, shared by every screen and kept in sync across tabs.
export function useTeam() {
  const team = useSyncExternalStore(store.subscribe, store.read, () => EMPTY)
  return [team, updateTeam] as const
}
