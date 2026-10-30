import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode, StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MatchView } from '@/lib/versus-api'

import { authStore } from '@/lib/auth'
import { stubFetch } from '@/test/fake-api'
import { FakeEventSource, stubEventSource } from '@/test/fake-event-source'
import { signIn } from '@/test/session'

import { useMatch } from './useMatch'

const view = { phase: 'waiting', turn: 0, you: 'host' } as unknown as MatchView

const joined = () => Response.json({ seat: 'guest' })

describe('useMatch', () => {
  beforeEach(() => signIn())
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('joins with the account, then streams with its token', async () => {
    const fetchMock = stubFetch(joined)
    const Source = stubEventSource()
    const { result } = renderHook(() => useMatch('abc'))
    await waitFor(() => expect(Source.last).not.toBeNull())
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('/api/matches/abc/join')
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      'Bearer test-token'
    )
    expect(Source.last?.url).toBe('/api/matches/abc/events?token=test-token')
    act(() => Source.last?.emit('view', view))
    expect(result.current.status).toBe('live')
    expect(result.current.view).toEqual(view)
  })

  it('asks you to sign in, and joins nothing, when signed out', async () => {
    window.localStorage.clear()
    const { authStore } = await import('@/lib/auth')
    authStore.update(() => null)
    const fetchMock = stubFetch()
    const Source = stubEventSource()
    const { result } = renderHook(() => useMatch('abc'))
    await waitFor(() => expect(result.current.status).toBe('signin'))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(Source.last).toBeNull()
  })

  it('is full on 409 and gone on 404, with no stream', async () => {
    const Source = stubEventSource()
    stubFetch(() => Response.json({ error: 'full' }, { status: 409 }))
    const full = renderHook(() => useMatch('abc'))
    await waitFor(() => expect(full.result.current.status).toBe('full'))
    stubFetch(() => Response.json({ error: 'nope' }, { status: 404 }))
    const gone = renderHook(() => useMatch('xyz'))
    await waitFor(() => expect(gone.result.current.status).toBe('gone'))
    expect(Source.last).toBeNull()
  })

  it('asks you to sign in again when the stream says the token expired', async () => {
    stubFetch(joined)
    const Source = stubEventSource()
    const { result } = renderHook(() => useMatch('abc'))
    await waitFor(() => expect(Source.last).not.toBeNull())
    act(() => Source.last?.emit('unauthorized'))
    expect(result.current.status).toBe('signin')
    expect(Source.last?.closed).toBe(true)
    // Signed out for real, so the app asks for a login instead of a dead session.
    expect(authStore.read()).toBeNull()
  })

  it('closes the source on gone so it does not reconnect', async () => {
    stubFetch(joined)
    const Source = stubEventSource()
    const { result } = renderHook(() => useMatch('abc'))
    await waitFor(() => expect(Source.last).not.toBeNull())
    act(() => Source.last?.emit('gone'))
    expect(result.current.status).toBe('gone')
    expect(Source.last?.closed).toBe(true)
  })

  it('keeps the end screen when a finished match is dropped', async () => {
    stubFetch(joined)
    const Source = stubEventSource()
    const { result } = renderHook(() => useMatch('abc'))
    await waitFor(() => expect(Source.last).not.toBeNull())
    const over = { ...view, phase: 'over' } as MatchView
    act(() => Source.last?.emit('view', over))
    act(() => Source.last?.emit('gone'))
    expect(result.current.status).toBe('live')
    expect(result.current.view).toEqual(over)
  })

  it('is replaced when a newer stream takes the seat', async () => {
    stubFetch(joined)
    const Source = stubEventSource()
    const { result } = renderHook(() => useMatch('abc'))
    await waitFor(() => expect(Source.last).not.toBeNull())
    act(() => Source.last?.emit('replaced'))
    expect(result.current.status).toBe('replaced')
    expect(Source.last?.closed).toBe(true)
  })

  it('leaves a reconnecting stream to the browser, and says it is reconnecting', async () => {
    stubFetch(joined)
    const Source = stubEventSource()
    const { result } = renderHook(() => useMatch('abc'))
    await waitFor(() => expect(Source.last).not.toBeNull())
    act(() => Source.last?.emit('view', view))
    expect(result.current.reconnecting).toBe(false)
    act(() => Source.last?.fail(FakeEventSource.CONNECTING))
    expect(result.current.status).toBe('live')
    expect(result.current.reconnecting).toBe(true)
    expect(Source.last?.closed).toBe(false)
    act(() => Source.last?.emit('view', view))
    expect(result.current.reconnecting).toBe(false)
  })

  it('reports a stream the browser gave up on, and retries', async () => {
    stubFetch(joined)
    const Source = stubEventSource()
    const { result } = renderHook(() => useMatch('abc'))
    await waitFor(() => expect(Source.last).not.toBeNull())
    const first = Source.last
    act(() => first?.fail(FakeEventSource.CLOSED))
    expect(result.current.status).toBe('error')
    act(() => result.current.retry())
    await waitFor(() => expect(Source.last).not.toBe(first))
  })

  it('sends moves with an idempotency key, and retries a lost request with the same key', async () => {
    let calls = 0
    const fetchMock = stubFetch(url => {
      if (url.pathname.endsWith('/join')) return joined()
      calls += 1
      // The first send never gets an answer (the network dropped it).
      if (calls === 1) throw new TypeError('Failed to fetch')
      return new Response(null, { status: 204 })
    })
    const Source = stubEventSource()
    const { result } = renderHook(() => useMatch('abc'))
    await waitFor(() => expect(Source.last).not.toBeNull())
    await act(() => result.current.send({ index: 0, timing: 1, type: 'move' }))
    const sends = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith('/actions')
    )
    expect(sends).toHaveLength(2)
    const keys = sends.map(([, init]) =>
      new Headers(init?.headers).get('Idempotency-Key')
    )
    expect(keys[0]).toBeTruthy()
    expect(keys[1]).toBe(keys[0])
    expect(JSON.parse(String(sends[0][1]?.body))).toEqual({
      action: { index: 0, timing: 1, type: 'move' }
    })
  })

  it('joins once under StrictMode', async () => {
    const fetchMock = stubFetch(joined)
    stubEventSource()
    renderHook(() => useMatch('abc'), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(StrictMode, null, children)
    })
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/join'))
      ).toHaveLength(1)
    )
  })

  it('closes the source on unmount', async () => {
    stubFetch(joined)
    const Source = stubEventSource()
    const { unmount } = renderHook(() => useMatch('abc'))
    await waitFor(() => expect(Source.last).not.toBeNull())
    unmount()
    expect(Source.last?.closed).toBe(true)
  })
})

describe('useMatch sessions and sends', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('asks you to sign in again, before joining, when your session ends within 15 minutes', async () => {
    authStore.update(() => ({
      expiresAt: Math.floor(Date.now() / 1000) + 10 * 60,
      token: 'test-token',
      user: { id: 'u1', username: 'Drew_1' }
    }))
    const fetchMock = stubFetch(joined)
    stubEventSource()
    const { result } = renderHook(() => useMatch('abc'))
    await waitFor(() => expect(result.current.status).toBe('signin'))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('goes to sign in when you sign out mid-match, and rejoins when you sign back in', async () => {
    signIn()
    stubFetch(joined)
    const Source = stubEventSource()
    const { result } = renderHook(() => useMatch('abc'))
    await waitFor(() => expect(Source.last).not.toBeNull())
    const first = Source.last
    act(() => authStore.update(() => null))
    await waitFor(() => expect(result.current.status).toBe('signin'))
    expect(first?.closed).toBe(true)
    act(() => signIn())
    await waitFor(() => expect(Source.last).not.toBe(first))
  })

  it('goes to sign in when a move comes back 401', async () => {
    signIn()
    stubFetch(url =>
      url.pathname.endsWith('/join')
        ? joined()
        : Response.json({ error: 'expired' }, { status: 401 })
    )
    const Source = stubEventSource()
    const { result } = renderHook(() => useMatch('abc'))
    await waitFor(() => expect(Source.last).not.toBeNull())
    await act(() =>
      result.current.send({ index: 0, timing: 1, type: 'move' }).catch(() => {})
    )
    await waitFor(() => expect(result.current.status).toBe('signin'))
  })

  it('does not resend a move the server answered with an error', async () => {
    signIn()
    const fetchMock = stubFetch(url =>
      url.pathname.endsWith('/join')
        ? joined()
        : Response.json({ error: 'boom' }, { status: 500 })
    )
    const Source = stubEventSource()
    const { result } = renderHook(() => useMatch('abc'))
    await waitFor(() => expect(Source.last).not.toBeNull())
    await expect(
      result.current.send({ index: 0, timing: 1, type: 'move' })
    ).rejects.toThrow()
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/actions'))
    ).toHaveLength(1)
  })

  it('retries a lost team lock-in with the same key', async () => {
    signIn()
    let calls = 0
    const fetchMock = stubFetch(url => {
      if (url.pathname.endsWith('/join')) return joined()
      calls += 1
      if (calls === 1) throw new TypeError('Failed to fetch')
      return new Response(null, { status: 204 })
    })
    const Source = stubEventSource()
    const { result } = renderHook(() => useMatch('abc'))
    await waitFor(() => expect(Source.last).not.toBeNull())
    await act(() => result.current.send({ creatureIds: [1], type: 'team' }))
    const keys = fetchMock.mock.calls
      .filter(([url]) => String(url).endsWith('/actions'))
      .map(([, init]) => new Headers(init?.headers).get('Idempotency-Key'))
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBeTruthy()
    expect(keys[1]).toBe(keys[0])
  })

  it('waits half a second before retrying a lost request', async () => {
    signIn()
    let calls = 0
    stubFetch(url => {
      if (url.pathname.endsWith('/join')) return joined()
      calls += 1
      if (calls === 1) throw new TypeError('Failed to fetch')
      return new Response(null, { status: 204 })
    })
    const Source = stubEventSource()
    const { result } = renderHook(() => useMatch('abc'))
    await waitFor(() => expect(Source.last).not.toBeNull())
    vi.useFakeTimers()
    try {
      const sent = result.current.send({ index: 0, timing: 1, type: 'move' })
      await vi.advanceTimersByTimeAsync(400)
      expect(calls).toBe(1)
      await vi.advanceTimersByTimeAsync(200)
      await sent
      expect(calls).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
