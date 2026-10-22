import type { Pokemon } from '../pokemon'

import {
  type BattleEvent,
  type BattleState,
  calcDamage,
  createFighter,
  CRIT_CHANCE,
  type Fighter,
  hits,
  type Rng,
  rollFrom,
  type Side,
  turnOrder
} from './engine'

export type Seat = 'guest' | 'host'

export type VersusAction =
  | { index: number; timing: number; type: 'move' }
  | { to: number; type: 'switch' }

export type VersusState = {
  guest: VersusTeam
  host: VersusTeam
  winner: null | Seat
}

export type VersusTeam = {
  active: number
  mustSwitch: boolean
  party: Fighter[]
}

type TurnResult = { events: BattleEvent[]; state: VersusState }

// Pure two-team rules for friend matches. Events are written from the host's
// side (host = 'player', guest = 'enemy'); `eventsFor` flips them per seat.
export const VERSUS_LEVEL = 50
export const NO_BAR_BONUS = 1.125
export const MAX_TIMING = 1.25

export const otherSeat = (seat: Seat): Seat =>
  seat === 'host' ? 'guest' : 'host'

const sideOf = (seat: Seat): Side => (seat === 'host' ? 'player' : 'enemy')

const activeOf = (team: VersusTeam) => team.party[team.active]

// Non-numbers count as 1; anything else is held to 1–1.25.
export function clampTiming(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 1
  return Math.min(MAX_TIMING, Math.max(1, value))
}

export function createVersusTeam(creatures: Pokemon[], seat: Seat): VersusTeam {
  return {
    active: 0,
    mustSwitch: false,
    party: creatures.map((creature, index) =>
      createFighter(creature, VERSUS_LEVEL, { uid: `${seat}-${index}` })
    )
  }
}

export const standing = (team: VersusTeam) =>
  team.party.filter(fighter => fighter.hp > 0).length

// The seat's own view, shaped like a wild battle so the existing scene can
// render it.
export function battleViewFor(state: VersusState, seat: Seat): BattleState {
  const team = state[seat]
  return {
    active: team.active,
    caught: false,
    enemy: activeOf(state[otherSeat(seat)]),
    mustSwitch: team.mustSwitch,
    party: team.party,
    versus: true,
    winner:
      state.winner === null ? null : state.winner === seat ? 'player' : 'enemy'
  }
}

export function eventsFor(events: BattleEvent[], seat: Seat): BattleEvent[] {
  if (seat === 'host') return events
  const flip = (side: Side): Side => (side === 'player' ? 'enemy' : 'player')
  return events.map(event => {
    if (event.type === 'damage') return { ...event, target: flip(event.target) }
    if ('side' in event && event.side)
      return { ...event, side: flip(event.side) }
    return event
  })
}

// One turn. Switches go first (host, then guest); then the chosen moves in
// speed order. The turn stops when someone faints.
export function resolveVersusTurn(
  state: VersusState,
  actions: Record<Seat, VersusAction>,
  rng: Rng
): TurnResult {
  if (state.winner || state.host.mustSwitch || state.guest.mustSwitch) {
    return { events: [], state }
  }
  const next = draft(state)
  const events: BattleEvent[] = []

  for (const seat of ['host', 'guest'] as const) {
    const action = actions[seat]
    if (action.type === 'switch') switchTo(next, seat, action.to, events)
  }

  const movers = (['host', 'guest'] as const).filter(
    seat => actions[seat].type === 'move'
  )
  const order =
    movers.length === 2
      ? turnOrder(
          activeOf(next.host).stats.speed,
          activeOf(next.guest).stats.speed,
          rng
        ).map(side => (side === 'player' ? 'host' : 'guest'))
      : movers
  for (const seat of order) {
    const action = actions[seat]
    if (action.type !== 'move') continue
    attack(next, seat, action, rng, events)
    if (next.winner || next.host.mustSwitch || next.guest.mustSwitch) break
  }

  return { events, state: next }
}

// After a faint: send out another creature. Free, so nobody else acts.
export function versusSendOut(
  state: VersusState,
  seat: Seat,
  to: number
): TurnResult {
  if (!state[seat].mustSwitch) return { events: [], state }
  const next = draft(state)
  const events: BattleEvent[] = []
  switchTo(next, seat, to, events)
  return { events, state: next }
}

function attack(
  state: VersusState,
  seat: Seat,
  action: Extract<VersusAction, { type: 'move' }>,
  rng: Rng,
  events: BattleEvent[]
) {
  const side = sideOf(seat)
  const targetSeat = otherSeat(seat)
  const attacker = activeOf(state[seat])
  const defender = activeOf(state[targetSeat])
  const move = attacker.moves[action.index]
  if (!move) throw new Error(`No move ${action.index} for ${seat}`)

  events.push({ move, side, type: 'move' })
  if (!hits(move, rng)) {
    events.push({ side, type: 'miss' })
    return
  }
  const crit = rng() < CRIT_CHANCE
  const { damage, effectiveness } = calcDamage({
    attacker,
    bonus: clampTiming(action.timing),
    crit,
    defender,
    move,
    roll: rollFrom(rng)
  })
  defender.hp = Math.max(0, defender.hp - damage)
  events.push({
    amount: damage,
    crit: crit && damage > 0,
    effectiveness,
    hp: defender.hp,
    target: sideOf(targetSeat),
    type: 'damage'
  })
  if (defender.hp === 0) faint(state, targetSeat, events)
}

// Copies everything a turn mutates, so the input state is untouched.
function draft(state: VersusState): VersusState {
  const copy = (team: VersusTeam): VersusTeam => ({
    ...team,
    party: team.party.map(fighter => ({ ...fighter }))
  })
  return { ...state, guest: copy(state.guest), host: copy(state.host) }
}

function faint(state: VersusState, seat: Seat, events: BattleEvent[]) {
  events.push({ side: sideOf(seat), type: 'faint' })
  if (standing(state[seat]) > 0) state[seat].mustSwitch = true
  else state.winner = otherSeat(seat)
}

function switchTo(
  state: VersusState,
  seat: Seat,
  to: number,
  events: BattleEvent[]
) {
  const team = state[seat]
  const incoming = team.party[to]
  if (!incoming || to === team.active || incoming.hp === 0) {
    throw new Error(`Can't switch to ${to}`)
  }
  const from = team.mustSwitch ? null : activeOf(team).creature.name
  team.active = to
  team.mustSwitch = false
  events.push({
    fighter: { ...incoming },
    from,
    side: sideOf(seat),
    type: 'switch'
  })
}
