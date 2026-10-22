import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

import type { BattleEvent, Rng } from '../src/lib/battle/engine'
import type { Pokemon } from '../src/lib/pokemon'
import type { MatchOutcome, MatchView } from '../src/lib/versus-api'

import { MAX_TEAM } from '../src/lib/battle/engine'
import {
  battleViewFor,
  clampTiming,
  createVersusTeam,
  eventsFor,
  otherSeat,
  resolveVersusTurn,
  type Seat,
  standing,
  type VersusAction,
  versusSendOut,
  type VersusState
} from '../src/lib/battle/versus'

export type ActResult =
  | { error: string; ok: false; status: 400 | 404 | 409 }
  | { ok: true }

// `replaced`: the same token opened a newer stream.
export type CloseReason = 'gone' | 'replaced'

export type MatchListener = {
  close: (reason: CloseReason) => void
  send: (view: MatchView) => void
}

export type MatchStore = ReturnType<typeof createMatchStore>

type Match = {
  createdAt: number
  // Host-side events of the last turn or send-out.
  events: BattleEvent[]
  finishedAt: null | number
  guest: null | SeatState
  host: SeatState
  outcome: null | { reason: MatchOutcome['reason']; winner: Seat }
  startedAt: null | number
  state: null | VersusState
  turn: number
}

type SeatState = {
  // The opponent is told this seat is disconnected: it has had no stream for
  // AWAY_GRACE_MS (or has never had one).
  away: boolean
  // When the seat's last stream dropped (or the seat was claimed); null while
  // a stream is open.
  disconnectedAt: null | number
  listeners: Set<MatchListener>
  pending: null | VersusAction
  team: null | number[]
  token: string
}

// How long a seat is without a stream before the opponent sees it as away,
// so a reload doesn't flicker. The battle's disconnect forfeit; the expiry of matches that never started
// and of finished ones.
export const AWAY_GRACE_MS = 5_000
export const DISCONNECT_MS = 60_000
export const UNSTARTED_MS = 30 * 60_000
export const FINISHED_MS = 10 * 60_000

const ID_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
const ID_LENGTH = 8

const fail = (status: 400 | 404 | 409, error: string): ActResult => ({
  error,
  ok: false,
  status
})

const isIndex = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0

const newToken = () => randomBytes(32).toString('base64url')

const newSeat = (time: number): SeatState => ({
  away: true,
  disconnectedAt: time,
  listeners: new Set(),
  pending: null,
  team: null,
  token: newToken()
})

// Friend matches held in memory. One instance holds them all, so `maxOpen`
// caps the memory; `sweep` (run by the routes and every 5 s) does the expiry,
// the away flags and the disconnect forfeits.
export function createMatchStore({
  creatures,
  maxOpen,
  now = Date.now,
  rng = Math.random
}: {
  creatures: ReadonlyMap<number, Pokemon>
  maxOpen: number
  now?: () => number
  rng?: Rng
}) {
  const matches = new Map<string, Match>()

  function seatOf(match: Match, token: string): null | Seat {
    if (sameToken(match.host.token, token)) return 'host'
    if (match.guest && sameToken(match.guest.token, token)) return 'guest'
    return null
  }

  function viewFor(match: Match, seat: Seat): MatchView {
    const mine = match[seat]!
    const theirs = match[otherSeat(seat)]
    const { outcome, state } = match
    return {
      acted: mine.pending !== null,
      battle: state && battleViewFor(state, seat),
      events: eventsFor(match.events, seat),
      opponent: {
        acted: theirs?.pending != null,
        connected: theirs?.away === false,
        joined: theirs !== null,
        ready: theirs?.team != null,
        standing: state ? standing(state[otherSeat(seat)]) : 0,
        switching: state ? state[otherSeat(seat)].mustSwitch : false
      },
      outcome: outcome && {
        reason: outcome.reason,
        winner: outcome.winner === seat ? 'you' : 'them'
      },
      phase: phaseOf(match),
      ready: mine.team !== null,
      turn: match.turn,
      you: seat
    }
  }

  function broadcast(match: Match) {
    for (const seat of ['host', 'guest'] as const) {
      const listeners = match[seat]?.listeners
      if (!listeners?.size) continue
      const view = viewFor(match, seat)
      for (const listener of listeners) listener.send(view)
    }
  }

  function finish(match: Match, winner: Seat, reason: MatchOutcome['reason']) {
    match.outcome = { reason, winner }
    match.finishedAt = now()
    match.host.pending = null
    if (match.guest) match.guest.pending = null
  }

  function remove(id: string, match: Match) {
    matches.delete(id)
    for (const seat of [match.host, match.guest]) {
      for (const listener of seat?.listeners ?? []) listener.close('gone')
      seat?.listeners.clear()
    }
  }

  function pickTeam(match: Match, seat: Seat, ids: unknown): ActResult {
    if (match.state || match.outcome) return fail(409, 'The battle has started')
    if (match[seat]!.team) return fail(409, 'Your team is already locked in')
    if (
      !Array.isArray(ids) ||
      ids.length < 1 ||
      ids.length > MAX_TEAM ||
      !ids.every(id => Number.isInteger(id) && creatures.has(id as number))
    ) {
      return fail(400, `A team is 1 to ${MAX_TEAM} known creature ids`)
    }
    match[seat]!.team = ids as number[]
    const { guest, host } = match
    if (host.team && guest?.team) {
      const teamOf = (team: number[], side: Seat) =>
        createVersusTeam(
          team.map(id => creatures.get(id)!),
          side
        )
      match.state = {
        guest: teamOf(guest.team, 'guest'),
        host: teamOf(host.team, 'host'),
        winner: null
      }
      match.startedAt = now()
      match.turn = 1
    }
    return { ok: true }
  }

  function takeTurn(
    match: Match,
    state: VersusState,
    seat: Seat,
    action: Record<string, unknown>
  ): ActResult {
    const team = state[seat]
    if (action.type === 'sendOut') {
      if (!team.mustSwitch) return fail(409, 'Nothing to send out')
      if (!canSwitchTo(state, seat, action.to)) {
        return fail(400, "Can't send that creature out")
      }
      const result = versusSendOut(state, seat, action.to as number)
      match.state = result.state
      match.events = result.events
      match.turn++
      return { ok: true }
    }

    if (state.host.mustSwitch || state.guest.mustSwitch) {
      return fail(409, 'Waiting for a send-out')
    }
    if (match[seat]!.pending) return fail(409, 'You already acted this turn')

    let chosen: VersusAction
    if (action.type === 'move') {
      const moves = team.party[team.active].moves
      if (!isIndex(action.index) || action.index >= moves.length) {
        return fail(400, 'No such move')
      }
      chosen = {
        index: action.index,
        timing: clampTiming(action.timing),
        type: 'move'
      }
    } else if (action.type === 'switch') {
      if (!canSwitchTo(state, seat, action.to)) {
        return fail(400, "Can't switch to that creature")
      }
      chosen = { to: action.to as number, type: 'switch' }
    } else return fail(400, 'Unknown action')

    match[seat]!.pending = chosen
    const host = match.host.pending
    const guest = match.guest!.pending
    if (host && guest) {
      const result = resolveVersusTurn(state, { guest, host }, rng)
      match.state = result.state
      match.events = result.events
      match.turn++
      match.host.pending = null
      match.guest!.pending = null
      if (result.state.winner) finish(match, result.state.winner, 'knockout')
    }
    return { ok: true }
  }

  return {
    act(id: string, token: string, action: unknown): ActResult {
      const match = matches.get(id)
      const seat = match && seatOf(match, token)
      if (!match || !seat) return fail(404, 'No such match')
      if (typeof action !== 'object' || action === null) {
        return fail(400, 'Unknown action')
      }
      const body = action as Record<string, unknown>

      let result: ActResult
      if (body.type === 'team') {
        result = pickTeam(match, seat, body.creatureIds)
      } else if (body.type === 'forfeit') {
        if (match.outcome) return fail(409, 'The match is over')
        finish(match, otherSeat(seat), 'forfeit')
        result = { ok: true }
      } else if (!['move', 'sendOut', 'switch'].includes(body.type as string)) {
        return fail(400, 'Unknown action')
      } else if (!match.state || match.outcome) {
        return fail(409, 'The battle is not running')
      } else result = takeTurn(match, match.state, seat, body)

      if (result.ok) broadcast(match)
      return result
    },

    create() {
      if (matches.size >= maxOpen) return null
      let matchId = ''
      do {
        matchId = Array.from(
          { length: ID_LENGTH },
          () => ID_ALPHABET[randomInt(ID_ALPHABET.length)]
        ).join('')
      } while (matches.has(matchId))
      const time = now()
      const host = newSeat(time)
      matches.set(matchId, {
        createdAt: time,
        events: [],
        finishedAt: null,
        guest: null,
        host,
        outcome: null,
        startedAt: null,
        state: null,
        turn: 0
      })
      return { matchId, token: host.token }
    },

    join(id: string) {
      const match = matches.get(id)
      if (!match) return { ok: false as const, status: 404 as const }
      if (match.guest || match.outcome) {
        return { ok: false as const, status: 409 as const }
      }
      match.guest = newSeat(now())
      broadcast(match)
      return { ok: true as const, token: match.guest.token }
    },

    size: () => matches.size,

    subscribe(id: string, token: string, listener: MatchListener) {
      const match = matches.get(id)
      const seat = match && seatOf(match, token)
      if (!match || !seat) return null
      const mine = match[seat]!
      // Newest stream wins: a reload or a second tab with the same token.
      for (const old of mine.listeners) old.close('replaced')
      mine.listeners.clear()
      mine.listeners.add(listener)
      mine.away = false
      mine.disconnectedAt = null
      broadcast(match)

      // The opponent hears about the drop from `sweep`, after the grace.
      return () => {
        if (!mine.listeners.delete(listener)) return
        if (mine.listeners.size === 0) mine.disconnectedAt = now()
      }
    },

    sweep() {
      const time = now()
      for (const [id, match] of matches) {
        const away = [match.host, match.guest].filter(
          seat =>
            seat &&
            !seat.away &&
            seat.disconnectedAt !== null &&
            time - seat.disconnectedAt >= AWAY_GRACE_MS
        )
        for (const seat of away) seat!.away = true

        if (match.finishedAt !== null) {
          if (time - match.finishedAt >= FINISHED_MS) remove(id, match)
        } else if (match.startedAt === null) {
          if (time - match.createdAt >= UNSTARTED_MS) remove(id, match)
        } else {
          // A seat that dropped before the battle gets the full 60 s from the start.
          const startedAt = match.startedAt
          const gone = (['host', 'guest'] as const).find(seat => {
            const left = match[seat]!.disconnectedAt
            return (
              left !== null && time - Math.max(left, startedAt) >= DISCONNECT_MS
            )
          })
          if (gone) {
            finish(match, otherSeat(gone), 'left')
            broadcast(match)
            continue
          }
        }
        if (away.length && matches.get(id) === match) broadcast(match)
      }
    }
  }
}

function canSwitchTo(state: VersusState, seat: Seat, to: unknown) {
  const team = state[seat]
  return isIndex(to) && to !== team.active && (team.party[to]?.hp ?? 0) > 0
}

function phaseOf(match: Match): MatchView['phase'] {
  if (match.outcome) return 'over'
  if (match.state) return 'battle'
  return match.guest ? 'picking' : 'waiting'
}

function sameToken(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}
