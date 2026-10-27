import { describe, expect, it } from 'vitest'

import { stubFetch } from '@/test/fake-api'

import {
  authFetch,
  authStore,
  currentSession,
  login,
  logout,
  type Session,
  signup
} from './auth'

const SESSION: Session = {
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
  token: 'tok',
  user: { id: 'u1', username: 'Drew_1' }
}

function answer(status: number, body: unknown) {
  return () => Response.json(body, { status })
}

describe('session', () => {
  it('login stores the session and authFetch sends the token', async () => {
    const fetchMock = stubFetch(answer(200, SESSION))
    expect(await login('Drew_1', 'correct horse')).toEqual(SESSION)
    expect(currentSession()).toEqual(SESSION)

    await authFetch('/api/me')
    const init = fetchMock.mock.calls[1][1]
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer tok')
  })

  it('signup stores the session too', async () => {
    stubFetch(answer(201, SESSION))
    await signup('Drew_1', 'correct horse')
    expect(currentSession()?.user.username).toBe('Drew_1')
  })

  it('throws the API message when login fails', async () => {
    stubFetch(answer(401, { error: 'Wrong username or password' }))
    await expect(login('Drew_1', 'nope')).rejects.toThrow(
      'Wrong username or password'
    )
    expect(currentSession()).toBeNull()
  })

  it('a 401 from authFetch signs out', async () => {
    authStore.update(() => SESSION)
    stubFetch(answer(401, { error: 'Sign in to continue' }))
    await authFetch('/api/me')
    expect(currentSession()).toBeNull()
  })

  it('an expired session reads as signed out', () => {
    authStore.update(() => ({ ...SESSION, expiresAt: 1 }))
    expect(currentSession()).toBeNull()
  })

  it('authFetch sends no token when signed out', async () => {
    const fetchMock = stubFetch(answer(200, {}))
    await authFetch('/api/pokemon')
    const init = fetchMock.mock.calls[0][1]
    expect(new Headers(init?.headers).has('Authorization')).toBe(false)
  })

  it('logout forgets the session', () => {
    authStore.update(() => SESSION)
    logout()
    expect(currentSession()).toBeNull()
  })
})
