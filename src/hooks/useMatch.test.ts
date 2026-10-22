import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode, StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MatchView } from '@/lib/versus-api'

import { saveToken, tokenKey } from '@/lib/versus-api'
import { stubFetch } from '@/test/fake-api'
import { FakeEventSource, stubEventSource } from '@/test/fake-event-source'

import { useMatch } from './useMatch'

const view = { phase: 'waiting', turn: 0, you: 'a' } as unknown as MatchView

describe('useMatch', () => {
  beforeEach(() => sessionStorage.clear())
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

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

  it('keeps the end screen when a finished match is dropped', () => {
    const Source = stubEventSource()
    sessionStorage.setItem(tokenKey('abc'), 'tok')
    const { result } = renderHook(() => useMatch('abc'))
    const over = { ...view, phase: 'over' } as MatchView
    act(() => Source.last?.emit('view', over))
    act(() => Source.last?.emit('gone'))
    expect(result.current.status).toBe('live')
    expect(result.current.view).toEqual(over)
    expect(Source.last?.closed).toBe(true)
  })

  it('is replaced when a newer stream takes the seat', () => {
    const Source = stubEventSource()
    sessionStorage.setItem(tokenKey('abc'), 'tok')
    const { result } = renderHook(() => useMatch('abc'))
    act(() => Source.last?.emit('view', view))
    act(() => Source.last?.emit('replaced'))
    expect(result.current.status).toBe('replaced')
    expect(Source.last?.closed).toBe(true)
  })

  it('leaves a reconnecting stream to the browser', () => {
    const Source = stubEventSource()
    sessionStorage.setItem(tokenKey('abc'), 'tok')
    const { result } = renderHook(() => useMatch('abc'))
    act(() => Source.last?.emit('view', view))
    act(() => Source.last?.fail(FakeEventSource.CONNECTING))
    act(() => Source.last?.fail(FakeEventSource.OPEN))
    expect(result.current.status).toBe('live')
    expect(Source.last?.closed).toBe(false)
  })

  it('reports a stream the browser gave up on and retries with the token', () => {
    const fetchMock = stubFetch()
    const Source = stubEventSource()
    sessionStorage.setItem(tokenKey('abc'), 'tok')
    const { result } = renderHook(() => useMatch('abc'))
    const first = Source.last
    act(() => first?.emit('view', view))
    act(() => first?.fail(FakeEventSource.CLOSED))
    expect(result.current.status).toBe('error')

    act(() => result.current.retry())
    expect(Source.last).not.toBe(first)
    expect(Source.last?.url).toBe('/api/matches/abc/events?token=tok')
    act(() => Source.last?.emit('view', view))
    expect(result.current.status).toBe('live')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps the token in memory when storage is blocked', () => {
    const fetchMock = stubFetch()
    const Source = stubEventSource()
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError')
    }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked)
    saveToken('mem', 'tok')
    renderHook(() => useMatch('mem'))
    expect(Source.last?.url).toBe('/api/matches/mem/events?token=tok')
    expect(fetchMock).not.toHaveBeenCalled()
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
