import { vi } from 'vitest'

import pokemonData from '@/data/pokemon.json'

import {
  parsePokemonQuery,
  queryPokemon,
  summarizePokemon
} from '../../server/query'

type Handler = (url: URL) => Promise<Response> | Response

// The real API logic over the real fixture data, without a server.
export function apiResponse(url: URL): Response {
  if (url.pathname === '/api/summary') {
    return Response.json(summarizePokemon(pokemonData))
  }
  const parsed = parsePokemonQuery(Object.fromEntries(url.searchParams))
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 })
  return Response.json(queryPokemon(pokemonData, parsed.query))
}

export function searchParamOf(call: unknown[], key: string) {
  return new URL(String(call[0]), 'http://localhost').searchParams.get(key)
}

export function stubFetch(handler: Handler = apiResponse) {
  const fetchMock = vi.fn(
    (input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const signal = init?.signal
        const abort = () =>
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        if (signal?.aborted) return abort()
        signal?.addEventListener('abort', abort, { once: true })
        Promise.resolve(
          handler(new URL(String(input), 'http://localhost'))
        ).then(resolve, reject)
      })
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
