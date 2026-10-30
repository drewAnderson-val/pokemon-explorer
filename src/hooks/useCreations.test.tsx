import type { ReactNode } from 'react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import type { Pokemon } from '@/lib/pokemon'

import { apiResponse, stubFetch } from '@/test/fake-api'
import { seedCreations } from '@/test/fake-server'
import { signIn } from '@/test/session'

import { useCreations } from './useCreations'

const creature = (id: number): Pokemon => ({
  attack: 80,
  defense: 70,
  description: 'A sleepy fox',
  generation: 10,
  height: 0.6,
  hp: 55,
  id,
  imageUrl: `https://img.test/creatures/${id}.png`,
  name: `C${id}`,
  specialAttack: 90,
  specialDefense: 60,
  speed: 100,
  types: ['Fire'],
  weight: 9.5
})

function render() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  })
  return renderHook(() => useCreations(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
  })
}

const ids = (list: Pokemon[]) => list.map(c => c.id)

describe('useCreations deletes', () => {
  beforeEach(() => signIn())

  it('brings back only the refused card, not one deleted meanwhile', async () => {
    seedCreations([creature(1001), creature(1002)])
    let refuse: () => void = () => {}
    stubFetch(async (url, init) => {
      if (init?.method === 'DELETE' && url.pathname.endsWith('/1001')) {
        await new Promise<void>(resolve => (refuse = resolve))
        return Response.json(
          { error: 'That creature is in a friend match' },
          { status: 409 }
        )
      }
      return apiResponse(url, init)
    })
    const { result } = render()
    await waitFor(() =>
      expect(ids(result.current.creations)).toEqual([1002, 1001])
    )

    let refused: Promise<void> = Promise.resolve()
    act(() => {
      refused = result.current.remove(1001).catch(() => {})
    })
    await act(() => result.current.remove(1002))
    act(() => refuse())
    await act(() => refused)
    expect(ids(result.current.creations)).toEqual([1001])
  })

  it('treats a card already deleted elsewhere (404) as deleted', async () => {
    seedCreations([creature(1001)])
    stubFetch((url, init) =>
      init?.method === 'DELETE'
        ? Response.json({ error: 'No creature #1001' }, { status: 404 })
        : apiResponse(url, init)
    )
    const { result } = render()
    await waitFor(() => expect(ids(result.current.creations)).toEqual([1001]))
    await act(() => result.current.remove(1001))
    await waitFor(() => expect(result.current.creations).toEqual([]))
  })
})
