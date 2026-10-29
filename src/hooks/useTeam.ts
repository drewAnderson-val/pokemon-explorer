import { useEffect, useSyncExternalStore } from 'react'

import {
  changeTeam,
  ensureTeamLoaded,
  reloadTeam,
  teamStatus
} from '@/lib/team/serverTeam'

import { useAuth } from './useAuth'

export const updateTeam = changeTeam

// The signed-in user's team (empty when signed out), shared by every screen.
// The setter takes the same "current team → new team" function as before; it
// shows the change at once, saves it to the API, and returns whether it applied.
export function useTeam() {
  const status = useTeamStatus()
  const token = useAuth()?.token
  useEffect(() => {
    ensureTeamLoaded()
  }, [token])
  // Another tab (or device) may have changed the team: fetch it again when this
  // tab comes back, so a stale copy can't overwrite those changes.
  useEffect(() => {
    if (!token) return
    const refresh = () => {
      if (document.visibilityState === 'visible' && teamStatus.read().loaded) {
        void reloadTeam()
      }
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
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
