import { API_BASE } from './api'
import { createLocalStore } from './localStore'

// What signup and login return. `expiresAt` is in Unix seconds; the token is
// useless after it, so the session is treated as signed out from then on.
export type Session = {
  expiresAt: number
  token: string
  user: { id: string; username: string }
}

export const SESSION_STORAGE_KEY = 'pokemon-explorer:session'

export const authStore = createLocalStore<null | Session>({
  empty: null,
  key: SESSION_STORAGE_KEY,
  parse: raw => {
    if (!raw) return null
    try {
      return JSON.parse(raw) as Session
    } catch {
      return null
    }
  },
  serialize: session => JSON.stringify(session)
})

// Every API call that may need the signed-in user goes through here. A 401 means
// the token expired or is no longer valid, so the session is dropped.
export async function authFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  const session = currentSession()
  if (session) headers.set('Authorization', `Bearer ${session.token}`)
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers })
  if (response.status === 401) logout()
  return response
}

export function currentSession(now = Date.now()): null | Session {
  const session = authStore.read()
  return session && session.expiresAt * 1000 > now ? session : null
}

export const login = (username: string, password: string) =>
  startSession('/api/auth/login', username, password)

export const signup = (username: string, password: string) =>
  startSession('/api/auth/signup', username, password)

// A throwaway account: no password, so it lasts as long as its 1-hour token.
export const playAsGuest = () => startSession('/api/auth/guest')

// The token lives only in this browser; forgetting it is signing out.
export function logout() {
  authStore.update(() => null)
}

async function startSession(
  path: string,
  username?: string,
  password?: string
) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    ...(username === undefined
      ? {}
      : {
          body: JSON.stringify({ password, username }),
          headers: { 'content-type': 'application/json' }
        })
  })
  const body = (await response.json().catch(() => null)) as
    | null
    | Session
    | { error?: string }
  if (!response.ok || !body || !('token' in body)) {
    const message = body && 'error' in body ? body.error : undefined
    throw new Error(message ?? `Sign-in failed (${response.status})`)
  }
  authStore.update(() => body)
  return body
}

// The sign-in screen, coming back to `next` (a path on this site) afterwards.
export const signInPath = (next: string) =>
  `/login?next=${encodeURIComponent(next)}`
