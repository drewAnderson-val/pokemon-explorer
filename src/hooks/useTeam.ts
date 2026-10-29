import { useEffect, useSyncExternalStore } from 'react'

import { changeTeam, ensureTeamLoaded, teamStatus } from '@/lib/team/serverTeam'

import { useAuth } from './useAuth'

export const updateTeam = changeTeam

// The signed-in user's team (empty when signed out), shared by every screen.
// The setter takes the same "current team → new team" function as before; it
// shows the change at once and saves it to the API.
export function useTeam() {
  const status = useTeamStatus()
  const token = useAuth()?.token
  useEffect(() => {
    ensureTeamLoaded()
  }, [token])
  return [status.members, changeTeam] as const
}

export function useTeamStatus() {
  return useSyncExternalStore(
    teamStatus.subscribe,
    teamStatus.read,
    teamStatus.read
  )
}
