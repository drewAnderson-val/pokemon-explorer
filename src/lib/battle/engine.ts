import type { Pokemon } from '../pokemon'

import { captureChance, catchRate, shakeChecks } from './catch'
import { type Move, moveCategory, movesFor } from './moves'
import {
  levelForXp,
  MAX_LEVEL,
  maxHpAt,
  START_LEVEL,
  type Stats,
  statsAt,
  xpForLevel,
  xpGain
} from './stats'
import { effectiveness } from './type-chart'

export type BattleEvent =
  | { amount: number; name: string; type: 'xp' }
  | {
      amount: number
      crit: boolean
      effectiveness: number
      hp: number
      target: Side
      type: 'damage'
    }
  // side: set in friend matches, where either side can switch.
  | { fighter: Fighter; from: null | string; side?: Side; type: 'switch' }
  | { fighter: Fighter; type: 'levelUp' }
  | { move: Move; side: Side; type: 'move' }
  | { shakes: number; type: 'catch' }
  | { side: Side; type: 'faint' }
  | { side: Side; type: 'miss' }
  | { type: 'blackout' }

export type BattleState = {
  // Index into `party` of the creature on the field.
  active: number
  caught: boolean
  enemy: Fighter
  // The active creature fainted and another must be sent out.
  mustSwitch: boolean
  party: Fighter[]
  // Friend match: no catching, XP or blackout.
  versus?: boolean
  winner: null | Side
}

export type Fighter = {
  creature: Pokemon
  hp: number
  level: number
  maxHp: number
  moves: Move[]
  stats: Stats
  // Ties the fighter back to its saved team member (or a fresh wild id).
  uid: string
  xp: number
}

export type PlayerAction =
  // timing: the timing-bar bonus (×1–1.25) on the player's damage.
  | { index: number; timing?: number; type: 'move' }
  | { to: number; type: 'switch' }
  | { type: 'catch' }

// Pure battle rules: no React, no timers. Every random choice goes through an
// injected `rng` (0 ≤ n < 1) so tests can script it.
export type Rng = () => number

export type Side = 'enemy' | 'player'

type Combatant = Pick<Fighter, 'creature' | 'level' | 'stats'>

type DamageInput = {
  attacker: Combatant
  // Extra multiplier (the timing bar), applied last.
  bonus?: number
  crit?: boolean
  defender: Combatant
  move: Move
  // Random factor, MIN_ROLL to 1.
  roll: number
}

type TurnResult = { events: BattleEvent[]; state: BattleState }

export const MAX_TEAM = 6
export const MAX_TIMING = 1.25
export const MIN_ROLL = 0.85
export const ENEMY_BEST_MOVE_CHANCE = 0.7
export const CRIT_CHANCE = 1 / 24
const CRIT_MULTIPLIER = 1.5
const STAB = 1.5
const WILD_LEVEL_SPREAD = 2
const MIN_WILD_LEVEL = 2

// The timing-bar bonus, held to 1–1.25; non-numbers count as 1. Applied to wild
// battles too: once the server plays them it can't trust the browser's value.
export function clampTiming(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 1
  return Math.min(MAX_TIMING, Math.max(1, value))
}

export const opponentOf = (side: Side): Side =>
  side === 'player' ? 'enemy' : 'player'

export const activeFighter = (state: BattleState) => state.party[state.active]

export function baseDamage(
  level: number,
  power: number,
  attack: number,
  defense: number
) {
  return Math.floor((((2 * level) / 5 + 2) * power * attack) / defense / 50 + 2)
}

export function calcDamage({
  attacker,
  bonus = 1,
  crit = false,
  defender,
  move,
  roll
}: DamageInput) {
  const physical = moveCategory(move.type) === 'physical'
  const attack = physical ? attacker.stats.attack : attacker.stats.specialAttack
  const defense = physical
    ? defender.stats.defense
    : defender.stats.specialDefense
  const stab = attacker.creature.types.includes(move.type) ? STAB : 1
  const multiplier = effectiveness(move.type, defender.creature.types)
  const raw = Math.floor(
    baseDamage(attacker.level, move.power, attack, defense) *
      roll *
      stab *
      (crit ? CRIT_MULTIPLIER : 1) *
      multiplier *
      bonus
  )
  // A hit that isn't immune always does something; flooring a resisted
  // weak hit could otherwise round it to 0.
  const damage = multiplier === 0 ? 0 : Math.max(1, raw)
  return { damage, effectiveness: multiplier }
}

export function createBattle(party: Fighter[], enemy: Fighter): BattleState {
  const active = party.findIndex(fighter => fighter.hp > 0)
  if (active < 0) throw new Error('Every team member has fainted')
  return {
    active,
    caught: false,
    enemy,
    mustSwitch: false,
    party,
    winner: null
  }
}

export function createFighter(
  creature: Pokemon,
  level: number,
  { hp, uid, xp }: { hp?: null | number; uid: string; xp?: number }
): Fighter {
  const maxHp = maxHpAt(creature.hp, level)
  return {
    creature,
    hp: hp == null ? maxHp : Math.min(maxHp, Math.max(0, hp)),
    level,
    maxHp,
    moves: movesFor(creature),
    stats: statsAt(creature, level),
    uid,
    xp: Math.max(xp ?? 0, xpForLevel(level))
  }
}

// Faster side first; a speed tie is a coin flip.
export function turnOrder(
  playerSpeed: number,
  enemySpeed: number,
  rng: Rng
): [Side, Side] {
  const playerFirst =
    playerSpeed === enemySpeed ? rng() < 0.5 : playerSpeed > enemySpeed
  return playerFirst ? ['player', 'enemy'] : ['enemy', 'player']
}

// Round(team average) ± 2: the app has no map, so wild levels follow the team.
export function wildLevel(levels: number[], rng: Rng) {
  const average =
    levels.length === 0
      ? START_LEVEL
      : Math.round(
          levels.reduce((sum, level) => sum + level, 0) / levels.length
        )
  const offset =
    Math.floor(rng() * (2 * WILD_LEVEL_SPREAD + 1)) - WILD_LEVEL_SPREAD
  return Math.min(MAX_LEVEL, Math.max(MIN_WILD_LEVEL, average + offset))
}

export const rollFrom = (rng: Rng) => MIN_ROLL + rng() * (1 - MIN_ROLL)

export const hits = (move: Move, rng: Rng) => rng() * 100 < move.accuracy

// 70% of the time the best move by expected damage, otherwise any move.
export function chooseEnemyMove(
  enemy: Fighter,
  target: Combatant,
  rng: Rng
): number {
  if (rng() < ENEMY_BEST_MOVE_CHANCE) {
    let best = 0
    let bestDamage = -1
    enemy.moves.forEach((move, index) => {
      const value = expectedDamage(enemy, target, move)
      if (value > bestDamage) {
        best = index
        bestDamage = value
      }
    })
    return best
  }
  return Math.min(
    Math.floor(rng() * enemy.moves.length),
    enemy.moves.length - 1
  )
}

// Average damage including the chance to miss (crits ignored).
export function expectedDamage(
  attacker: Combatant,
  defender: Combatant,
  move: Move
) {
  const { damage } = calcDamage({
    attacker,
    defender,
    move,
    roll: (MIN_ROLL + 1) / 2
  })
  return (damage * move.accuracy) / 100
}

// One turn. Switching and throwing happen before any move (as in the games);
// then the enemy acts. A move turn runs both moves in speed order. The turn
// stops when someone faints.
export function resolveTurn(
  state: BattleState,
  action: PlayerAction,
  rng: Rng
): TurnResult {
  if (state.winner || state.mustSwitch) return { events: [], state }
  const next = draft(state)
  const events: BattleEvent[] = []

  if (action.type === 'move') {
    const enemyMove = chooseEnemyMove(next.enemy, activeFighter(next), rng)
    const order = turnOrder(
      activeFighter(next).stats.speed,
      next.enemy.stats.speed,
      rng
    )
    for (const side of order) {
      if (side === 'player') {
        attack(
          next,
          side,
          action.index,
          rng,
          events,
          clampTiming(action.timing)
        )
      } else attack(next, side, enemyMove, rng, events)
      if (next.winner || next.mustSwitch) break
    }
  } else {
    if (action.type === 'switch') switchTo(next, action.to, events)
    else throwBall(next, rng, events)
    if (!next.winner) {
      const enemyMove = chooseEnemyMove(next.enemy, activeFighter(next), rng)
      attack(next, 'enemy', enemyMove, rng, events)
    }
  }

  return { events, state: next }
}

// After a faint: send out another creature. Free, so the enemy doesn't act.
export function sendOut(state: BattleState, to: number): TurnResult {
  if (!state.mustSwitch) return { events: [], state }
  const next = draft(state)
  const events: BattleEvent[] = []
  switchTo(next, to, events)
  return { events, state: next }
}

// One attack: the move event, then a miss or a damage event. Mutates the
// defender's hp. Draws rng in order: hit, crit, roll. Returns whether it hit.
export function strike(
  {
    attacker,
    bonus,
    defender,
    move,
    rng,
    side,
    target
  }: {
    attacker: Fighter
    bonus: number
    defender: Fighter
    move: Move
    rng: Rng
    side: Side
    target: Side
  },
  events: BattleEvent[]
) {
  events.push({ move, side, type: 'move' })
  if (!hits(move, rng)) {
    events.push({ side, type: 'miss' })
    return false
  }
  const crit = rng() < CRIT_CHANCE
  const { damage, effectiveness } = calcDamage({
    attacker,
    bonus,
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
    target,
    type: 'damage'
  })
  return true
}

function attack(
  state: BattleState,
  side: Side,
  moveIndex: number,
  rng: Rng,
  events: BattleEvent[],
  bonus = 1
) {
  const target = opponentOf(side)
  const attacker = side === 'player' ? activeFighter(state) : state.enemy
  const defender = target === 'player' ? activeFighter(state) : state.enemy
  const move = attacker.moves[moveIndex]
  if (!move) throw new Error(`No move ${moveIndex} for ${side}`)

  const struck = strike(
    { attacker, bonus, defender, move, rng, side, target },
    events
  )
  if (struck && defender.hp === 0) faint(state, target, events)
}

// Defeating or catching gives XP to the creature on the field. Leveling
// raises max HP, and current HP rises by the same amount.
function awardXp(state: BattleState, events: BattleEvent[]) {
  const fighter = activeFighter(state)
  if (fighter.level >= MAX_LEVEL) return
  const amount = xpGain(state.enemy.creature, state.enemy.level)
  fighter.xp += amount
  events.push({ amount, name: fighter.creature.name, type: 'xp' })
  const level = levelForXp(fighter.xp)
  if (level <= fighter.level) return
  const maxHp = maxHpAt(fighter.creature.hp, level)
  fighter.hp += maxHp - fighter.maxHp
  fighter.level = level
  fighter.maxHp = maxHp
  fighter.stats = statsAt(fighter.creature, level)
  events.push({ fighter: { ...fighter }, type: 'levelUp' })
}

// Copies everything resolveTurn mutates, so the input state is untouched.
function draft(state: BattleState): BattleState {
  return {
    ...state,
    enemy: { ...state.enemy },
    party: state.party.map(fighter => ({ ...fighter }))
  }
}

function faint(state: BattleState, side: Side, events: BattleEvent[]) {
  events.push({ side, type: 'faint' })
  if (side === 'enemy') {
    state.winner = 'player'
    awardXp(state, events)
  } else if (state.party.some(fighter => fighter.hp > 0)) {
    state.mustSwitch = true
  } else {
    state.winner = 'enemy'
    events.push({ type: 'blackout' })
  }
}

function switchTo(state: BattleState, to: number, events: BattleEvent[]) {
  const incoming = state.party[to]
  if (!incoming || to === state.active || incoming.hp === 0) {
    throw new Error(`Can't switch to ${to}`)
  }
  const from = state.mustSwitch ? null : activeFighter(state).creature.name
  state.active = to
  state.mustSwitch = false
  events.push({ fighter: { ...incoming }, from, type: 'switch' })
}

function throwBall(state: BattleState, rng: Rng, events: BattleEvent[]) {
  if (state.party.length >= MAX_TEAM) throw new Error('The team is full')
  const { enemy } = state
  const chance = captureChance(catchRate(enemy.creature), enemy.hp, enemy.maxHp)
  const shakes = shakeChecks(chance, rng)
  events.push({ shakes, type: 'catch' })
  if (shakes === 4) {
    state.caught = true
    state.winner = 'player'
    awardXp(state, events)
  }
}
