// @vitest-environment node
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import express from 'express'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Pokemon } from '../src/lib/pokemon'
import type { MatchView } from '../src/lib/versus-api'

import pokemonData from '../src/data/pokemon.json'
import app from './app'
import { createMatchStore } from './matches'
import { matchesRoute } from './matches-route'
import { createWindowLimiter } from './rate-limit'

type Frame = { data: unknown; event: string }

const creatures = new Map((pokemonData as Pokemon[]).map(p => [p.id, p]))

let server: Server
let base = ''
const aborts: AbortController[] = []

async function listen(target: express.Express) {
  return new Promise<{ base: string; server: Server }>(resolve => {
    const s = target.listen(0, () =>
      resolve({
        base: `http://127.0.0.1:${(s.address() as AddressInfo).port}`,
        server: s
      })
    )
  })
}

function mount(limit = 20) {
  const router = matchesRoute({
    perClient: createWindowLimiter(limit, 60_000),
    store: createMatchStore({ creatures, maxOpen: 500 })
  })
  return express().use(router)
}

beforeEach(async () => {
  ;({ base, server } = await listen(mount()))
})

afterEach(async () => {
  for (const abort of aborts.splice(0)) abort.abort()
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
})

const post = (path: string, body?: unknown) =>
  fetch(`${base}${path}`, {
    body: JSON.stringify(body ?? {}),
    headers: { 'content-type': 'application/json' },
    method: 'POST'
  })

// Opens an event stream; `next()` resolves with the next frame.
async function openStream(path: string) {
  const abort = new AbortController()
  aborts.push(abort)
  const res = await fetch(`${base}${path}`, { signal: abort.signal })
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const frames: Frame[] = []

  async function next(): Promise<Frame> {
    for (;;) {
      const frame = frames.shift()
      if (frame) return frame
      const { done, value } = await reader.read()
      if (done) throw new Error('stream ended')
      buffer += decoder.decode(value, { stream: true })
      let split: number
      while ((split = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, split)
        buffer = buffer.slice(split + 2)
        const event = /^event: (.*)$/m.exec(raw)?.[1]
        const data = /^data: (.*)$/m.exec(raw)?.[1]
        if (event && data) frames.push({ data: JSON.parse(data), event })
      }
    }
  }

  // Skips frames until a view satisfies the check.
  async function nextView(check: (view: MatchView) => boolean) {
    for (;;) {
      const frame = await next()
      if (frame.event === 'view' && check(frame.data as MatchView)) {
        return frame.data as MatchView
      }
    }
  }

  return { abort: () => abort.abort(), next, nextView, res }
}

async function startMatch() {
  const created = await post('/api/matches')
  const host = (await created.json()) as { matchId: string; token: string }
  const joined = await post(`/api/matches/${host.matchId}/join`)
  const guest = (await joined.json()) as { token: string }
  const url = (token: string) =>
    `/api/matches/${host.matchId}/events?token=${token}`
  const act = (token: string, action: unknown) =>
    post(`/api/matches/${host.matchId}/actions`, { action, token })
  return { act, guest: guest.token, host: host.token, id: host.matchId, url }
}

describe('create and join', () => {
  it('creates, joins once, and 404s an unknown match', async () => {
    const created = await post('/api/matches')
    expect(created.status).toBe(201)
    const { matchId, token } = (await created.json()) as {
      matchId: string
      token: string
    }
    expect(matchId).toMatch(/^[a-z0-9]{8}$/)
    expect(token.length).toBeGreaterThan(20)

    const joined = await post(`/api/matches/${matchId}/join`)
    expect(joined.status).toBe(200)
    expect(((await joined.json()) as { token: string }).token).not.toBe(token)
    expect((await post(`/api/matches/${matchId}/join`)).status).toBe(409)
    expect((await post('/api/matches/nope/join')).status).toBe(404)
  })

  it('limits creation per client', async () => {
    for (let i = 0; i < 20; i++) {
      expect((await post('/api/matches')).status).toBe(201)
    }
    expect((await post('/api/matches')).status).toBe(429)
  })

  it('503s when the store is full', async () => {
    await new Promise<void>(resolve => server.close(() => resolve()))
    const full = express().use(
      matchesRoute({
        perClient: createWindowLimiter(20, 60_000),
        store: createMatchStore({ creatures, maxOpen: 1 })
      })
    )
    ;({ base, server } = await listen(full))
    expect((await post('/api/matches')).status).toBe(201)
    const res = await post('/api/matches')
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({
      error: 'Too many open matches. Try again soon.'
    })
  })
})

describe('events', () => {
  it('answers 200 with a gone frame for a bad token', async () => {
    const { id } = await startMatch()
    const stream = await openStream(`/api/matches/${id}/events?token=bad`)
    expect(stream.res.status).toBe(200)
    expect(stream.res.headers.get('content-type')).toContain(
      'text/event-stream'
    )
    expect((await stream.next()).event).toBe('gone')
  })

  it('plays a turn over HTTP and streams it to both players', async () => {
    const m = await startMatch()
    const host = await openStream(m.url(m.host))
    const guest = await openStream(m.url(m.guest))
    expect((await host.next()).event).toBe('view')

    expect((await m.act(m.host, { creatureIds: [1], type: 'team' })).status).toBe(
      204
    )
    expect(
      (await m.act(m.guest, { creatureIds: [2], type: 'team' })).status
    ).toBe(204)
    await host.nextView(v => v.phase === 'battle')
    await guest.nextView(v => v.phase === 'battle')

    const move = { index: 0, timing: 1, type: 'move' }
    expect((await m.act(m.host, move)).status).toBe(204)
    expect((await m.act(m.guest, move)).status).toBe(204)
    expect((await host.nextView(v => v.turn === 2)).turn).toBe(2)
    expect((await guest.nextView(v => v.turn === 2)).turn).toBe(2)
  })

  it('opens with the current view after a reconnect', async () => {
    const m = await startMatch()
    const first = await openStream(m.url(m.host))
    await m.act(m.host, { creatureIds: [1], type: 'team' })
    await m.act(m.guest, { creatureIds: [2], type: 'team' })
    await first.nextView(v => v.phase === 'battle')
    first.abort()

    const again = await openStream(m.url(m.host))
    const frame = await again.next()
    expect(frame.event).toBe('view')
    expect(frame.data).toMatchObject({ phase: 'battle', turn: 1 })
  })

  it('tells an older stream with the same token it was replaced', async () => {
    const m = await startMatch()
    const first = await openStream(m.url(m.host))
    expect((await first.next()).event).toBe('view')
    const second = await openStream(m.url(m.host))
    expect((await second.next()).event).toBe('view')
    expect((await first.next()).event).toBe('replaced')
  })
})

describe('actions', () => {
  it('rejects a malformed body with a 400', async () => {
    const { id } = await startMatch()
    const res = await post(`/api/matches/${id}/actions`, {})
    expect(res.status).toBe(400)
    expect(await res.json()).toHaveProperty('error')
  })

  it('404s a wrong token', async () => {
    const { id } = await startMatch()
    const res = await post(`/api/matches/${id}/actions`, {
      action: { type: 'forfeit' },
      token: 'nope'
    })
    expect(res.status).toBe(404)
  })
})

describe('mounted app', () => {
  it('serves POST /api/matches', async () => {
    const real = await listen(app)
    try {
      const res = await fetch(`${real.base}/api/matches`, { method: 'POST' })
      expect(res.status).toBe(201)
    } finally {
      await new Promise<void>(resolve => real.server.close(() => resolve()))
    }
  })
})
