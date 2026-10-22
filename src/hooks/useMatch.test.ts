import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode, StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MatchView } from '@/lib/versus-api'

import { tokenKey } from '@/lib/versus-api'
import { stubFetch } from '@/test/fake-api'
import { stubEventSource } from '@/test/fake-event-source'

import { useMatch } from './useMatch'

const view = { phase: 'waiting', turn: 0, you: 'a' } as unknown as MatchView

describe('useMatch', () => {
  beforeEach(() => sessionStorage.clear())
  afterEach(() => vi.unstubAllGlobals())

  it('streams with a saved token without joining', async () => {
    const fetchMock = stubFetch()
    const Source = stubEventSource()
    sessionStorage.setItem(tokenKey('abc'), 'tok')
    const { result } = renderHook(() => useMatch('abc'))
    expect(Source.last?.url).toBe('/api/matches/abc/events?token=tok')
    expect(result.current.status).toBe('connecting')
    act(() => Source.last?.emit('view', view))
    expect(result.current.status).toBe('live')
    expect(result.current.view).toEqual(view)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('joins without a token, saves it, then streams', async () => {
    const fetchMock = stubFetch(() => Response.json({ token: 'new' }))
    const Source = stubEventSource()
    renderHook(() => useMatch('abc'))
    await waitFor(() => expect(Source.last).not.toBeNull())
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/matches/abc/join')
    expect(sessionStorage.getItem(tokenKey('abc'))).toBe('new')
    expect(Source.last?.url).toBe('/api/matches/abc/events?token=new')
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

  it('closes the source on gone so it does not reconnect', () => {
    const Source = stubEventSource()
    sessionStorage.setItem(tokenKey('abc'), 'tok')
    const { result } = renderHook(() => useMatch('abc'))
    act(() => Source.last?.emit('gone'))
    expect(result.current.status).toBe('gone')
    expect(Source.last?.closed).toBe(true)
  })

  it('closes the source on unmount', () => {
    const Source = stubEventSource()
    sessionStorage.setItem(tokenKey('abc'), 'tok')
    const { unmount } = renderHook(() => useMatch('abc'))
    unmount()
    expect(Source.last?.closed).toBe(true)
  })

  it('posts the token and action', async () => {
    const fetchMock = stubFetch(() => new Response(null, { status: 204 }))
    stubEventSource()
    sessionStorage.setItem(tokenKey('abc'), 'tok')
    const { result } = renderHook(() => useMatch('abc'))
    await act(() => result.current.send({ type: 'forfeit' }))
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('/api/matches/abc/actions')
    expect(JSON.parse(String(init?.body))).toEqual({
      action: { type: 'forfeit' },
      token: 'tok'
    })
  })

  it('joins once under StrictMode', async () => {
    const fetchMock = stubFetch(() => Response.json({ token: 'new' }))
    const Source = stubEventSource()
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(StrictMode, null, children)
    const { result } = renderHook(() => useMatch('abc'), { wrapper })
    await waitFor(() => expect(Source.last).not.toBeNull())
    act(() => Source.last?.emit('view', view))
    expect(result.current.status).toBe('live')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports a failed join and recovers on retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    stubFetch(() => Response.json({ error: 'boom' }, { status: 500 }))
    const Source = stubEventSource()
    const { result } = renderHook(() => useMatch('abc'))
    await waitFor(() => expect(result.current.status).toBe('error'))
    stubFetch(() => Response.json({ token: 'new' }))
    act(() => result.current.retry())
    await waitFor(() => expect(Source.last).not.toBeNull())
    act(() => Source.last?.emit('view', view))
    expect(result.current.status).toBe('live')
  })
})
