// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'

import type { Pokemon } from '../src/lib/pokemon'
import type { MatchView } from '../src/lib/versus-api'

import pokemonData from '../src/data/pokemon.json'
import { eventsFor } from '../src/lib/battle/versus'
import {
  AWAY_GRACE_MS,
  createMatchStore,
  DISCONNECT_MS,
  FINISHED_MS,
  UNSTARTED_MS
} from './matches'

const creatures = new Map(
  (pokemonData as Pokemon[]).map(creature => [creature.id, creature])
)

// With rng 0 every move hits and crits: 115 (speed 199) knocks out 703 or 610
// in one hit before either can move.
const STRONG = 115
const WEAK = 703
const WEAK_TOO = 610

let t = 0
let store: ReturnType<typeof createMatchStore>

beforeEach(() => {
  t = 0
  store = createMatchStore({
    creatures,
    maxOpen: 500,
    now: () => t,
    rng: () => 0
  })
})

type Watcher = ReturnType<typeof watch>

function open() {
  const created = store.create()!
  const joined = store.join(created.matchId)
  if (!joined.ok) throw new Error('join failed')
  const id = created.matchId
  return {
    guest: watch(id, joined.token),
    guestToken: joined.token,
    host: watch(id, created.token),
    hostToken: created.token,
    id
  }
}

// Both teams locked in: host [STRONG], guest [WEAK, WEAK_TOO].
function started() {
  const match = open()
  store.act(match.id, match.hostToken, { creatureIds: [STRONG], type: 'team' })
  store.act(match.id, match.guestToken, {
    creatureIds: [WEAK, WEAK_TOO],
    type: 'team'
  })
  return match
}

function watch(id: string, token: string) {
  const views: MatchView[] = []
  const reasons: string[] = []
  const unsubscribe = store.subscribe(id, token, {
    close: reason => reasons.push(reason),
    send: view => views.push(view)
  })
  if (!unsubscribe) throw new Error('subscribe failed')
  return {
    closed: () => reasons.length,
    last: () => views[views.length - 1],
    reasons,
    unsubscribe,
    views
  }
}

const move = (index = 0) => ({ index, timing: 1, type: 'move' })

// Host knocks out the guest's first creature.
function knockout() {
  const match = started()
  store.act(match.id, match.hostToken, move())
  store.act(match.id, match.guestToken, move())
  return match
}

describe('create and join', () => {
  it('creates a match with a readable id and a token, up to maxOpen', () => {
    const created = store.create()!
    expect(created.matchId).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/)
    expect(created.token).toMatch(/^[\w-]{43}$/)
    for (let i = 1; i < 500; i++) expect(store.create()).not.toBeNull()
    expect(store.size()).toBe(500)
    expect(store.create()).toBeNull()
  })

  it('lets one guest join', () => {
    const { matchId } = store.create()!
    const joined = store.join(matchId)
    expect(joined).toEqual({ ok: true, token: expect.any(String) })
    expect(store.join(matchId)).toEqual({ ok: false, status: 409 })
    expect(store.join('nope2345')).toEqual({ ok: false, status: 404 })
  })

  it('sends the current view on subscribe and on every change', () => {
    const { matchId, token } = store.create()!
    const host = watch(matchId, token)
    expect(host.views).toHaveLength(1)
    expect(host.last()).toMatchObject({
      acted: false,
      battle: null,
      opponent: { joined: false },
      outcome: null,
      phase: 'waiting',
      ready: false,
      turn: 0,
      you: 'host'
    })
    const joined = store.join(matchId)
    if (!joined.ok) throw new Error('join failed')
    const guest = watch(matchId, joined.token)
    expect(host.last()).toMatchObject({
      opponent: { connected: true, joined: true },
      phase: 'picking'
    })
    expect(guest.last()).toMatchObject({
      opponent: { connected: true, joined: true },
      phase: 'picking',
      you: 'guest'
    })
  })
})

describe('team', () => {
  it('rejects bad teams with 400', () => {
    const { guestToken, id } = open()
    const team = (creatureIds: unknown) =>
      store.act(id, guestToken, { creatureIds, type: 'team' })
    expect(team([])).toMatchObject({ ok: false, status: 400 })
    expect(team([1, 2, 3, 4, 5, 6, 7])).toMatchObject({
      ok: false,
      status: 400
    })
    expect(team([1.5])).toMatchObject({ ok: false, status: 400 })
    expect(team([999_999])).toMatchObject({ ok: false, status: 400 })
    expect(team('1')).toMatchObject({ ok: false, status: 400 })
  })

  it('accepts a team before the guest joins, once per seat', () => {
    const { matchId, token } = store.create()!
    const host = watch(matchId, token)
    const team = { creatureIds: [STRONG], type: 'team' }
    expect(store.act(matchId, token, team)).toEqual({ ok: true })
    expect(host.last()).toMatchObject({ phase: 'waiting', ready: true })
    expect(store.act(matchId, token, team)).toMatchObject({
      ok: false,
      status: 409
    })
  })

  it("never shows the opponent's team before the battle", () => {
    const { guest, guestToken, host, hostToken, id } = open()
    store.act(id, guestToken, { creatureIds: [WEAK, WEAK_TOO], type: 'team' })
    expect(host.last()).toMatchObject({
      battle: null,
      opponent: { ready: true },
      ready: false
    })
    expect(guest.last()).toMatchObject({ battle: null, ready: true })
    const seen = JSON.stringify(host.views)
    expect(seen).not.toContain(`"id":${WEAK}`)
    expect(seen).not.toContain(`"id":${WEAK_TOO}`)
    expect(hostToken).toBeTruthy()
  })

  it('starts the battle at Lv50 once both are ready', () => {
    const { guest, guestToken, host, id } = started()
    for (const [watcher, ids] of [
      [host, [STRONG]],
      [guest, [WEAK, WEAK_TOO]]
    ] as [Watcher, number[]][]) {
      const view = watcher.last()
      expect(view).toMatchObject({ events: [], phase: 'battle', turn: 1 })
      expect(view.battle!.party.map(f => f.creature.id)).toEqual(ids)
      expect(view.battle!.party.every(f => f.level === 50)).toBe(true)
    }
    expect(host.last().opponent.standing).toBe(2)
    expect(host.last().battle!.enemy.creature.id).toBe(WEAK)
    expect(
      store.act(id, guestToken, { creatureIds: [WEAK], type: 'team' })
    ).toMatchObject({ ok: false, status: 409 })
  })
})

describe('battle', () => {
  it('waits for both actions, then resolves the turn', () => {
    const { guest, guestToken, host, hostToken, id } = started()
    expect(store.act(id, hostToken, move())).toEqual({ ok: true })
    expect(host.last()).toMatchObject({ acted: true, turn: 1 })
    expect(guest.last()).toMatchObject({
      acted: false,
      opponent: { acted: true },
      turn: 1
    })
    expect(store.act(id, hostToken, move())).toMatchObject({
      ok: false,
      status: 409
    })

    expect(store.act(id, guestToken, move())).toEqual({ ok: true })
    const hostView = host.last()
    expect(hostView).toMatchObject({ acted: false, turn: 2 })
    expect(hostView.events.length).toBeGreaterThan(0)
    expect(guest.last().events).toEqual(eventsFor(hostView.events, 'guest'))
  })

  it('rejects invalid moves and switches with 400', () => {
    const { guestToken, id } = started()
    const act = (action: unknown) => store.act(id, guestToken, action)
    expect(act(move(9))).toMatchObject({ ok: false, status: 400 })
    expect(act(move(0.5))).toMatchObject({ ok: false, status: 400 })
    expect(act({ to: 0, type: 'switch' })).toMatchObject({
      ok: false,
      status: 400
    })
    expect(act({ to: 5, type: 'switch' })).toMatchObject({
      ok: false,
      status: 400
    })
    expect(act({ type: 'dance' })).toMatchObject({ ok: false, status: 400 })
    expect(act(null)).toMatchObject({ ok: false, status: 400 })
    expect(act({ to: 1, type: 'sendOut' })).toMatchObject({
      ok: false,
      status: 409
    })
  })

  it('makes the fainted seat send out before anyone acts', () => {
    const { guest, guestToken, host, hostToken, id } = knockout()
    expect(guest.last().battle!.mustSwitch).toBe(true)
    expect(host.last().opponent).toMatchObject({ standing: 1, switching: true })
    expect(store.act(id, hostToken, move())).toMatchObject({
      ok: false,
      status: 409
    })
    expect(store.act(id, guestToken, move())).toMatchObject({
      ok: false,
      status: 409
    })
    expect(store.act(id, guestToken, { to: 0, type: 'sendOut' })).toMatchObject(
      { ok: false, status: 400 }
    )

    expect(store.act(id, guestToken, { to: 1, type: 'sendOut' })).toEqual({
      ok: true
    })
    expect(host.last().turn).toBe(3)
    expect(host.last().events).toEqual([
      expect.objectContaining({ side: 'enemy', type: 'switch' })
    ])
    expect(guest.last().events).toEqual([
      expect.objectContaining({ side: 'player', type: 'switch' })
    ])
    expect(host.last().battle!.enemy.creature.id).toBe(WEAK_TOO)
    expect(store.act(id, guestToken, { to: 0, type: 'switch' })).toMatchObject({
      ok: false,
      status: 400
    })
  })

  it('ends when the last fighter is knocked out', () => {
    const { guest, guestToken, host, hostToken, id } = knockout()
    store.act(id, guestToken, { to: 1, type: 'sendOut' })
    store.act(id, hostToken, move())
    store.act(id, guestToken, move())
    expect(host.last()).toMatchObject({
      outcome: { reason: 'knockout', winner: 'you' },
      phase: 'over'
    })
    expect(guest.last()).toMatchObject({
      outcome: { reason: 'knockout', winner: 'them' },
      phase: 'over'
    })
    expect(store.act(id, hostToken, move())).toMatchObject({
      ok: false,
      status: 409
    })
  })

  it('switches before moves in a turn', () => {
    const { guestToken, host, hostToken, id } = started()
    store.act(id, guestToken, { to: 1, type: 'switch' })
    store.act(id, hostToken, move())
    expect(host.last().events[0]).toMatchObject({
      from: expect.any(String),
      side: 'enemy',
      type: 'switch'
    })
    expect(host.last().battle!.enemy.creature.id).toBe(WEAK_TOO)
  })
})

describe('forfeit', () => {
  it('ends a battle', () => {
    const { guest, guestToken, host, id } = started()
    expect(store.act(id, guestToken, { type: 'forfeit' })).toEqual({ ok: true })
    expect(host.last()).toMatchObject({
      outcome: { reason: 'forfeit', winner: 'you' },
      phase: 'over'
    })
    expect(guest.last().outcome).toEqual({ reason: 'forfeit', winner: 'them' })
    expect(store.act(id, guestToken, { type: 'forfeit' })).toMatchObject({
      ok: false,
      status: 409
    })
  })

  it('ends a match still picking teams', () => {
    const { guest, hostToken, id } = open()
    store.act(id, hostToken, { type: 'forfeit' })
    expect(guest.last()).toMatchObject({
      outcome: { reason: 'forfeit', winner: 'you' },
      phase: 'over'
    })
  })
})

describe('disconnects', () => {
  it('forfeits a battle after 60 s away', () => {
    const { guest, guestToken, host, id } = started()
    guest.unsubscribe()
    t += DISCONNECT_MS - 1
    store.sweep()
    expect(host.last()).toMatchObject({
      opponent: { connected: false },
      phase: 'battle'
    })

    const back = watch(id, guestToken)
    expect(host.last().opponent.connected).toBe(true)
    t += DISCONNECT_MS
    store.sweep()
    expect(back.last().phase).toBe('battle')

    back.unsubscribe()
    t += DISCONNECT_MS
    store.sweep()
    expect(host.last()).toMatchObject({
      outcome: { reason: 'left', winner: 'you' },
      phase: 'over'
    })
    expect(watch(id, guestToken).last().outcome).toEqual({
      reason: 'left',
      winner: 'them'
    })
  })

  it('never forfeits before the battle', () => {
    const { matchId, token } = store.create()!
    watch(matchId, token).unsubscribe()
    t += 10 * 60_000
    store.sweep()
    expect(store.size()).toBe(1)
    expect(watch(matchId, token).last().phase).toBe('waiting')
  })

  it('gives a seat that never connected 60 s from the start', () => {
    const { matchId, token } = store.create()!
    const joined = store.join(matchId)
    if (!joined.ok) throw new Error('join failed')
    const host = watch(matchId, token)
    t += 5 * 60_000
    store.act(matchId, token, { creatureIds: [STRONG], type: 'team' })
    store.act(matchId, joined.token, { creatureIds: [WEAK], type: 'team' })
    t += DISCONNECT_MS - 1
    store.sweep()
    expect(host.last().phase).toBe('battle')
    t += 1
    store.sweep()
    expect(host.last().outcome).toEqual({ reason: 'left', winner: 'you' })
  })

  it('shows a drop to the opponent only after 5 s away', () => {
    const { guest, guestToken, host, id } = started()
    guest.unsubscribe()
    t += AWAY_GRACE_MS - 1
    store.sweep()
    watch(id, guestToken)
    t += AWAY_GRACE_MS
    store.sweep()
    expect(host.views.every(view => view.opponent.connected)).toBe(true)
  })

  it('tells the opponent once a seat has been away 5 s', () => {
    const { guest, host } = started()
    guest.unsubscribe()
    expect(host.last().opponent.connected).toBe(true)
    t += AWAY_GRACE_MS
    store.sweep()
    expect(host.last().opponent.connected).toBe(false)
  })

  it('still forfeits 60 s after the drop, not after the grace', () => {
    const { guest, host } = started()
    guest.unsubscribe()
    t += AWAY_GRACE_MS
    store.sweep()
    t += DISCONNECT_MS - AWAY_GRACE_MS
    store.sweep()
    expect(host.last().outcome).toEqual({ reason: 'left', winner: 'you' })
  })

  it('lets the newest stream for a seat win', () => {
    const { guest, host: first, hostToken, id } = started()
    const second = watch(id, hostToken)
    expect(first.reasons).toEqual(['replaced'])
    expect(second.closed()).toBe(0)
    // The old stream's own cleanup must not count as a disconnect.
    first.unsubscribe()
    t += DISCONNECT_MS
    store.sweep()
    expect(guest.last()).toMatchObject({
      opponent: { connected: true },
      phase: 'battle'
    })
  })
})

describe('expiry', () => {
  it('drops an unstarted match after 30 min, closing its streams', () => {
    const { guest, guestToken, host, id } = open()
    t = UNSTARTED_MS - 1
    store.sweep()
    expect(store.size()).toBe(1)
    t = UNSTARTED_MS
    store.sweep()
    expect(store.size()).toBe(0)
    expect(host.reasons).toEqual(['gone'])
    expect(guest.reasons).toEqual(['gone'])
    expect(store.subscribe(id, guestToken, { close() {}, send() {} })).toBe(
      null
    )
    expect(store.join(id)).toEqual({ ok: false, status: 404 })
  })

  it('drops a finished match 10 min after it ends', () => {
    const { guestToken, host, id } = started()
    t = 20 * 60_000
    store.act(id, guestToken, { type: 'forfeit' })
    t += FINISHED_MS - 1
    store.sweep()
    expect(store.size()).toBe(1)
    t += 1
    store.sweep()
    expect(store.size()).toBe(0)
    expect(host.closed()).toBe(1)
  })

  it('keeps a running battle past 30 min', () => {
    const { host } = started()
    t = UNSTARTED_MS * 2
    store.sweep()
    expect(store.size()).toBe(1)
    expect(host.last().phase).toBe('battle')
  })
})

describe('tokens', () => {
  it('rejects a bad token or unknown match', () => {
    const { id } = open()
    expect(store.subscribe(id, 'bad', { close() {}, send() {} })).toBeNull()
    expect(store.act(id, 'bad', { type: 'forfeit' })).toMatchObject({
      ok: false,
      status: 404
    })
    expect(store.act('nope2345', 'bad', { type: 'forfeit' })).toMatchObject({
      ok: false,
      status: 404
    })
  })
})
