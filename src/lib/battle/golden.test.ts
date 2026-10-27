// @vitest-environment node
// Records scripted battles: real creatures, exact random numbers, and every event
// and state that comes out. The Python engine (api/app/engine/) replays the same
// file and must produce identical output, random draw for random draw.
// Regenerate with: UPDATE_GOLDEN=1 pnpm vitest run src/lib/battle/golden.test.ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, it } from 'vitest'

import type { Pokemon } from '../pokemon'

import pokemonData from '../../data/pokemon.json'
import {
  type BattleEvent,
  type BattleState,
  createBattle,
  createFighter,
  type PlayerAction,
  resolveTurn,
  sendOut,
  wildLevel
} from './engine'
import {
  battleViewFor,
  clampTiming,
  createVersusTeam,
  eventsFor,
  resolveVersusTurn,
  type Seat,
  type VersusAction,
  versusSendOut,
  type VersusState
} from './versus'

const GOLDEN = path.resolve(__dirname, '../../../api/tests/golden/battles.json')
const pokemon = pokemonData as Pokemon[]
const byId = (id: number) => pokemon.find(p => p.id === id)!
const findId = (test: (p: Pokemon) => boolean) => pokemon.find(test)!.id

type Member = { hp?: null | number; id: number; level: number; xp?: number }

type Scenario =
  | {
      kind: 'versus'
      name: string
      setup: {
        guest: number[]
        host: number[]
        // Starting HP per seat and slot (null = full), to set up faints.
        hp?: Partial<Record<Seat, (null | number)[]>>
      }
      steps: Step[]
    }
  | {
      kind: 'wild'
      name: string
      setup: { enemy: Member; party: Member[] }
      steps: Step[]
    }

type Step =
  | { action: PlayerAction; call: 'resolveTurn'; rng: number[] }
  | {
      actions: Record<Seat, VersusAction>
      call: 'resolveVersusTurn'
      rng: number[]
    }
  | { call: 'battleViewFor'; seat: Seat }
  | { call: 'clampTiming'; values: unknown[] }
  | { call: 'eventsFor'; seat: Seat }
  | { call: 'sendOut'; to: number }
  | { call: 'versusSendOut'; seat: Seat; to: number }
  | { call: 'wildLevel'; levels: number[]; rng: number[] }

// Hands out the scripted numbers in order and counts them; running out is a bug.
function scripted(values: number[]) {
  let used = 0
  const rng = () => {
    if (used >= values.length)
      throw new Error('rng ran out of scripted numbers')
    return values[used++]
  }
  return { rng, used: () => used }
}

const move = (index: number, timing?: number): PlayerAction =>
  timing === undefined
    ? { index, type: 'move' }
    : { index, timing, type: 'move' }
const vMove = (index: number, timing = 1): VersusAction => ({
  index,
  timing,
  type: 'move'
})
const plenty = (first: number[]) => [...first, ...Array(20).fill(0.5)]

// Creatures picked by property, so the scenarios say why each was chosen.
const NORMAL_ONLY = findId(p => p.types.length === 1 && p.types[0] === 'Normal')
const GHOST = findId(
  p => p.types.includes('Ghost') && !p.types.includes('Normal')
)
const FIRE = findId(p => p.types[0] === 'Fire')
const WATER = findId(p => p.types[0] === 'Water')
const speedTwin = (() => {
  for (const a of pokemon)
    for (const b of pokemon)
      if (a.id < b.id && a.speed === b.speed) return [a.id, b.id]
  throw new Error('no equal speeds')
})()

const SCENARIOS: Scenario[] = [
  {
    kind: 'wild',
    name: 'move turn, both hit',
    setup: { enemy: { id: 2, level: 20 }, party: [{ id: 1, level: 20 }] },
    steps: [
      {
        action: move(0),
        call: 'resolveTurn',
        rng: plenty([0.1, 0.3, 0.9, 0.4, 0.3, 0.9, 0.4])
      }
    ]
  },
  {
    kind: 'wild',
    name: 'speed tie broken each way',
    setup: {
      enemy: { id: speedTwin[1], level: 30 },
      party: [{ id: speedTwin[0], level: 30 }]
    },
    steps: [
      { action: move(0), call: 'resolveTurn', rng: plenty([0.1, 0.3]) },
      { action: move(0), call: 'resolveTurn', rng: plenty([0.1, 0.7]) }
    ]
  },
  {
    kind: 'wild',
    name: 'a critical hit',
    setup: { enemy: { id: 3, level: 50 }, party: [{ id: 4, level: 50 }] },
    steps: [
      {
        action: move(0),
        call: 'resolveTurn',
        rng: plenty([0.1, 0.0, 0.01, 0.6, 0.0, 0.5, 0.6])
      }
    ]
  },
  {
    kind: 'wild',
    name: 'both miss',
    setup: { enemy: { id: 3, level: 50 }, party: [{ id: 4, level: 50 }] },
    // Enemy picks at random (0.7 → move 1, under 100 accuracy); both rolls 0.999 miss.
    steps: [
      {
        action: move(1),
        call: 'resolveTurn',
        rng: plenty([0.7, 0.3, 0.999, 0.999])
      }
    ]
  },
  {
    kind: 'wild',
    name: 'immune target takes 0',
    setup: {
      enemy: { id: GHOST, level: 20 },
      party: [{ id: NORMAL_ONLY, level: 20 }]
    },
    steps: [{ action: move(0), call: 'resolveTurn', rng: plenty([0.1]) }]
  },
  {
    kind: 'wild',
    name: 'timing bonus on the player move',
    setup: { enemy: { id: 6, level: 30 }, party: [{ id: 5, level: 30 }] },
    steps: [{ action: move(0, 1.25), call: 'resolveTurn', rng: plenty([0.1]) }]
  },
  {
    kind: 'wild',
    name: 'enemy faints, XP and a level-up',
    setup: { enemy: { hp: 1, id: 7, level: 30 }, party: [{ id: 8, level: 5 }] },
    // Enemy picks at random (0.7 → move 1, under 100 accuracy) and misses (0.99).
    steps: [
      {
        action: move(0),
        call: 'resolveTurn',
        rng: plenty([0.7, 0.3, 0.99, 0.0, 0.9, 0.5, 0.99, 0.0, 0.9, 0.5])
      }
    ]
  },
  {
    kind: 'wild',
    name: 'faint, send out, blackout',
    setup: {
      enemy: { id: FIRE, level: 40 },
      party: [
        { hp: 1, id: NORMAL_ONLY, level: 5 },
        { hp: 1, id: NORMAL_ONLY, level: 5 }
      ]
    },
    steps: [
      {
        action: move(0),
        call: 'resolveTurn',
        rng: plenty([0.1, 0.0, 0.9, 0.5, 0.0, 0.9, 0.5])
      },
      { call: 'sendOut', to: 1 },
      {
        action: move(0),
        call: 'resolveTurn',
        rng: plenty([0.1, 0.0, 0.9, 0.5, 0.0, 0.9, 0.5])
      }
    ]
  },
  {
    kind: 'wild',
    name: 'switch, then the enemy attacks the new creature',
    setup: {
      enemy: { id: 10, level: 20 },
      party: [
        { id: 11, level: 20 },
        { id: 12, level: 22, xp: 12000 }
      ]
    },
    steps: [
      {
        action: { to: 1, type: 'switch' },
        call: 'resolveTurn',
        rng: plenty([0.1, 0.2, 0.9, 0.5])
      }
    ]
  },
  {
    kind: 'wild',
    name: 'catch fails at 2 shakes, then succeeds',
    setup: { enemy: { id: 13, level: 10 }, party: [{ id: 14, level: 20 }] },
    steps: [
      {
        action: { type: 'catch' },
        call: 'resolveTurn',
        rng: plenty([0.0, 0.0, 0.999, 0.1, 0.5, 0.9, 0.5])
      },
      {
        action: { type: 'catch' },
        call: 'resolveTurn',
        rng: plenty([0.0, 0.0, 0.0, 0.0])
      }
    ]
  },
  {
    kind: 'wild',
    name: 'enemy picks a random move',
    setup: { enemy: { id: 16, level: 25 }, party: [{ id: 15, level: 25 }] },
    steps: [{ action: move(0), call: 'resolveTurn', rng: plenty([0.8, 0.6]) }]
  },
  {
    kind: 'wild',
    name: 'wild level: JS rounds 5.5 up',
    setup: { enemy: { id: 1, level: 5 }, party: [{ id: 1, level: 5 }] },
    steps: [
      { call: 'wildLevel', levels: [5, 6], rng: [0.0] },
      { call: 'wildLevel', levels: [5, 6], rng: [0.999] },
      { call: 'wildLevel', levels: [5, 6], rng: [0.5] },
      { call: 'wildLevel', levels: [], rng: [0.5] }
    ]
  },
  {
    kind: 'versus',
    name: 'both move, a faint stops the turn',
    setup: { guest: [WATER, 22], host: [FIRE, 21], hp: { guest: [1, null] } },
    steps: [
      {
        actions: { guest: vMove(0, 1.25), host: vMove(0, 1.1) },
        call: 'resolveVersusTurn',
        rng: plenty([0.3, 0.0, 0.9, 0.5, 0.0, 0.9, 0.5])
      },
      { call: 'versusSendOut', seat: 'guest', to: 1 }
    ]
  },
  {
    kind: 'versus',
    name: 'one switches, the other moves; then a send-out',
    setup: { guest: [24, 25], host: [23, 26], hp: { host: [null, 1] } },
    steps: [
      {
        actions: { guest: vMove(0), host: { to: 1, type: 'switch' } },
        call: 'resolveVersusTurn',
        rng: plenty([0.0, 0.9, 0.5])
      },
      { call: 'versusSendOut', seat: 'host', to: 0 }
    ]
  },
  {
    kind: 'versus',
    name: 'the last creature faints: a winner, and both views',
    setup: { guest: [28], host: [27], hp: { guest: [1] } },
    steps: [
      {
        actions: { guest: vMove(1), host: vMove(0) },
        call: 'resolveVersusTurn',
        rng: plenty([0.0, 0.9, 0.5, 0.0, 0.9, 0.5])
      },
      { call: 'battleViewFor', seat: 'host' },
      { call: 'battleViewFor', seat: 'guest' },
      { call: 'eventsFor', seat: 'host' },
      { call: 'eventsFor', seat: 'guest' }
    ]
  },
  {
    kind: 'versus',
    name: 'timing clamp',
    setup: { guest: [2], host: [1] },
    steps: [{ call: 'clampTiming', values: ['x', 0.5, 2, 1.1, 1, true, null] }]
  }
]

function record(scenario: Scenario) {
  let wild = scenario.kind === 'wild' ? wildState(scenario.setup) : null
  let versus = scenario.kind === 'versus' ? versusState(scenario.setup) : null
  let lastEvents: BattleEvent[] = []

  const steps = scenario.steps.map(step => {
    switch (step.call) {
      case 'battleViewFor':
        return { ...step, result: battleViewFor(versus!, step.seat) }
      case 'clampTiming':
        return { ...step, result: step.values.map(clampTiming) }
      case 'eventsFor':
        return { ...step, result: eventsFor(lastEvents, step.seat) }
      case 'resolveTurn': {
        const { rng, used } = scripted(step.rng)
        const result = resolveTurn(wild!, step.action, rng)
        wild = result.state
        return { ...step, result: { ...result, rngUsed: used() } }
      }
      case 'resolveVersusTurn': {
        const { rng, used } = scripted(step.rng)
        const result = resolveVersusTurn(versus!, step.actions, rng)
        versus = result.state
        lastEvents = result.events
        return { ...step, result: { ...result, rngUsed: used() } }
      }
      case 'sendOut': {
        const result = sendOut(wild!, step.to)
        wild = result.state
        return { ...step, result: { ...result, rngUsed: 0 } }
      }
      case 'versusSendOut': {
        const result = versusSendOut(versus!, step.seat, step.to)
        versus = result.state
        lastEvents = result.events
        return { ...step, result: { ...result, rngUsed: 0 } }
      }
      case 'wildLevel': {
        const { rng, used } = scripted(step.rng)
        const value = wildLevel(step.levels, rng)
        return { ...step, result: { rngUsed: used(), value } }
      }
    }
  })
  return { ...scenario, steps }
}

function versusState(
  setup: Extract<Scenario, { kind: 'versus' }>['setup']
): VersusState {
  const state: VersusState = {
    guest: createVersusTeam(setup.guest.map(byId), 'guest'),
    host: createVersusTeam(setup.host.map(byId), 'host'),
    winner: null
  }
  for (const seat of ['host', 'guest'] as const) {
    setup.hp?.[seat]?.forEach((hp, i) => {
      if (hp !== null) state[seat].party[i].hp = hp
    })
  }
  return state
}

function wildState(setup: { enemy: Member; party: Member[] }): BattleState {
  const party = setup.party.map((m, i) =>
    createFighter(byId(m.id), m.level, {
      hp: m.hp ?? null,
      uid: `p${i}`,
      xp: m.xp
    })
  )
  const enemy = createFighter(byId(setup.enemy.id), setup.enemy.level, {
    hp: setup.enemy.hp ?? null,
    uid: 'wild'
  })
  return createBattle(party, enemy)
}

it('matches the golden file', () => {
  const computed = JSON.parse(JSON.stringify(SCENARIOS.map(record)))
  if (process.env.UPDATE_GOLDEN) {
    writeFileSync(GOLDEN, `${JSON.stringify(computed, null, 2)}\n`)
  }
  expect(existsSync(GOLDEN)).toBe(true)
  expect(computed).toEqual(JSON.parse(readFileSync(GOLDEN, 'utf8')))
})
