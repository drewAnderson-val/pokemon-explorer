import { useSyncExternalStore } from 'react'

import { authStore, currentSession, type Session } from '@/lib/auth'

// The signed-in session, or null. Shared by every screen and kept in sync
// across tabs, like the team.
export function useAuth(): null | Session {
  return useSyncExternalStore(authStore.subscribe, currentSession, () => null)
}
