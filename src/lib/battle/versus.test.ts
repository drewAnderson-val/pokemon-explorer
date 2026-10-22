import { describe, expect, it } from 'vitest'

import pokemon from '@/data/pokemon.json'
import { scriptedRng } from '@/test/battle'

import type { Pokemon } from '../pokemon'

import { statsAt } from './stats'
import {
  battleViewFor,
  clampTiming,
  createVersusTeam,
  eventsFor,
  resolveVersusTurn,
  standing,
  type VersusAction,
  versusSendOut,
  type VersusState
} from './versus'

const byId = (id: number) => (pokemon as Pokemon[]).find(p => p.id === id)!

// Ids 1 (speed 132) and 2 (178): the guest creature is faster at Lv50.
const SLOW = byId(1)
const FAST = byId(2)
const THIRD = byId(3)

const move = (index = 0, timing = 1): VersusAction => ({
  index,
  timing,
  type: 'move'
})

const makeState = (
  host = [SLOW, THIRD],
  guest = [FAST, THIRD]
): VersusState => ({
  guest: createVersusTeam(guest, 'guest'),
  host: createVersusTeam(host, 'host'),
  winner: null
})

// hit, no crit, roll — per attack.
const HIT = [0, 0.5, 0.5]
const NEVER = () => {
  throw new Error('rng should not be used')
}

describe('createVersusTeam', () => {
  it('puts every fighter at Lv50, full HP, active 0', () => {
    const team = createVersusTeam([SLOW, FAST], 'host')
    expect(team.active).toBe(0)
    expect(team.mustSwitch).toBe(false)
    expect(team.party.map(f => f.uid)).toEqual(['host-0', 'host-1'])
    for (const fighter of team.party) {
      expect(fighter.level).toBe(50)
      expect(fighter.hp).toBe(fighter.maxHp)
    }
  })
})

describe('clampTiming', () => {
  it('holds timing to 1–1.25 and treats non-numbers as 1', () => {
    expect(clampTiming(2)).toBe(1.25)
    expect(clampTiming(0.5)).toBe(1)
    expect(clampTiming('x')).toBe(1)
    expect(clampTiming(Number.NaN)).toBe(1)
    expect(clampTiming(1.1)).toBe(1.1)
  })
})

describe('resolveVersusTurn', () => {
  it('runs both moves, faster first, without mutating the input', () => {
    const state = makeState()
    const snapshot = structuredClone(state)
    expect(statsAt(FAST, 50).speed).toBeGreaterThan(statsAt(SLOW, 50).speed)
    const { events } = resolveVersusTurn(
      state,
      { guest: move(), host: move() },
      scriptedRng(...HIT, ...HIT)
    )
    const moves = events.filter(e => e.type === 'move')
    expect(moves.map(e => e.side)).toEqual(['enemy', 'player'])
    expect(events.filter(e => e.type === 'damage')).toHaveLength(2)
    expect(state).toEqual(snapshot)
  })

  it('lets a switch go before the opponent move', () => {
    const state = makeState()
    const { events, state: next } = resolveVersusTurn(
      state,
      { guest: { to: 1, type: 'switch' }, host: move() },
      scriptedRng(...HIT)
    )
    expect(events[0]).toMatchObject({ side: 'enemy', type: 'switch' })
    expect(next.guest.active).toBe(1)
    const damage = events.find(e => e.type === 'damage')
    expect(damage).toMatchObject({ target: 'enemy' })
    expect(next.guest.party[1].hp).toBeLessThan(next.guest.party[1].maxHp)
    expect(next.guest.party[0].hp).toBe(next.guest.party[0].maxHp)
  })

  it('stops the turn at a faint and asks for a switch', () => {
    const state = makeState()
    state.guest.party[0].hp = 1
    const { events, state: next } = resolveVersusTurn(
      state,
      { guest: move(), host: move() },
      scriptedRng(...HIT, 0.1, ...HIT)
    )
    // Guest is faster, so it attacks first; host's move then faints it.
    expect(events.map(e => e.type)).toEqual([
      'move',
      'damage',
      'move',
      'damage',
      'faint'
    ])
    expect(next.guest.mustSwitch).toBe(true)
    expect(next.winner).toBeNull()
  })

  it('does not let the slower fighter act after being fainted', () => {
    const state = makeState()
    state.host.party[0].hp = 1
    const { events, state: next } = resolveVersusTurn(
      state,
      { guest: move(), host: move() },
      scriptedRng(...HIT)
    )
    expect(events.filter(e => e.type === 'move')).toHaveLength(1)
    expect(next.host.mustSwitch).toBe(true)
  })

  it('names the other seat winner when the last fighter faints', () => {
    const state = makeState([SLOW], [FAST])
    state.host.party[0].hp = 1
    const { events, state: next } = resolveVersusTurn(
      state,
      { guest: move(), host: move() },
      scriptedRng(...HIT)
    )
    expect(next.winner).toBe('guest')
    expect(next.host.mustSwitch).toBe(false)
    expect(events.some(e => e.type === 'blackout')).toBe(false)
  })

  it('returns the same state when a team must switch or it is over', () => {
    const waiting = makeState()
    waiting.guest.mustSwitch = true
    const over = { ...makeState(), winner: 'host' as const }
    for (const state of [waiting, over]) {
      const result = resolveVersusTurn(
        state,
        { guest: move(), host: move() },
        NEVER
      )
      expect(result.events).toEqual([])
      expect(result.state).toBe(state)
    }
  })

  it('applies timing only to that seat', () => {
    const damageFor = (timing: number) => {
      const { events } = resolveVersusTurn(
        makeState(),
        { guest: move(0, 1), host: move(0, timing) },
        scriptedRng(...HIT, ...HIT)
      )
      return events.filter(e => e.type === 'damage')
    }
    const [guestLow, hostLow] = damageFor(1)
    const [guestHigh, hostHigh] = damageFor(1.25)
    expect(hostHigh.amount).toBeGreaterThan(hostLow.amount)
    expect(guestHigh.amount).toBe(guestLow.amount)
  })
})

describe('versusSendOut', () => {
  it('rejects fainted or active targets', () => {
    const state = makeState()
    state.host.party[0].hp = 0
    state.host.party[1].hp = 0
    state.host.mustSwitch = true
    expect(() => versusSendOut(state, 'host', 1)).toThrow()
    expect(() => versusSendOut(state, 'host', 0)).toThrow()
  })

  it('clears mustSwitch and emits a switch from null', () => {
    const state = makeState()
    state.host.party[0].hp = 0
    state.host.mustSwitch = true
    const { events, state: next } = versusSendOut(state, 'host', 1)
    expect(next.host.mustSwitch).toBe(false)
    expect(next.host.active).toBe(1)
    expect(events).toMatchObject([
      { from: null, side: 'player', type: 'switch' }
    ])
    expect(state.host.active).toBe(0)
  })
})

describe('views', () => {
  it('standing counts fighters with hp', () => {
    const team = createVersusTeam([SLOW, FAST], 'host')
    team.party[0].hp = 0
    expect(standing(team)).toBe(1)
  })

  it('eventsFor swaps sides for the guest', () => {
    const { events } = resolveVersusTurn(
      makeState(),
      { guest: move(), host: move() },
      scriptedRng(...HIT, ...HIT)
    )
    expect(eventsFor(events, 'host')).toBe(events)
    const flipped = eventsFor(events, 'guest')
    expect(flipped.filter(e => e.type === 'move').map(e => e.side)).toEqual([
      'player',
      'enemy'
    ])
    expect(flipped.filter(e => e.type === 'damage').map(e => e.target)).toEqual(
      ['enemy', 'player']
    )
  })

  it('battleViewFor shows own team, opposing active and mapped winner', () => {
    const state = makeState()
    const view = battleViewFor(state, 'guest')
    expect(view.party).toBe(state.guest.party)
    expect(view.enemy).toBe(state.host.party[0])
    expect(view).toMatchObject({ caught: false, versus: true, winner: null })
    const won = battleViewFor({ ...state, winner: 'guest' }, 'guest')
    expect(won.winner).toBe('player')
    expect(battleViewFor({ ...state, winner: 'guest' }, 'host').winner).toBe(
      'enemy'
    )
  })
})
