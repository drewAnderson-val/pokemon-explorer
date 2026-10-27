import { describe, expect, it } from 'vitest'

import { makeFighter, scriptedRng } from '@/test/battle'

import {
  activeFighter,
  baseDamage,
  calcDamage,
  chooseEnemyMove,
  createBattle,
  MAX_TEAM,
  resolveTurn,
  sendOut,
  turnOrder,
  wildLevel
} from './engine'
import { type Move, moveCategory, movesFor } from './moves'

const move = (type: Move['type'], power: number, accuracy = 100): Move => ({
  accuracy,
  name: `${type} ${power}`,
  power,
  type
})

// Crit check value that never crits (1/24 ≈ 0.042).
const NO_CRIT = 0.5

describe('baseDamage', () => {
  it('uses the attacker level in the level term', () => {
    expect(baseDamage(50, 60, 100, 100)).toBe(28)
    expect(baseDamage(5, 60, 15, 15)).toBe(6)
  })
})

describe('calcDamage', () => {
  it('uses levelled stats, STAB and type', () => {
    const fire = makeFighter({ specialAttack: 120, types: ['Fire'] })
    const grass = makeFighter({ specialDefense: 80, types: ['Grass'] })
    // spA 125 vs spD 85 → base 57; × 1.5 STAB × 2.
    const hit = { attacker: fire, defender: grass, move: move('Fire', 85) }
    expect(calcDamage({ ...hit, roll: 1 })).toEqual({
      damage: 171,
      effectiveness: 2
    })
    expect(calcDamage({ ...hit, roll: 0.85 }).damage).toBe(145)
    expect(calcDamage({ ...hit, crit: true, roll: 1 }).damage).toBe(256)
  })

  it('makes level matter', () => {
    const strong = makeFighter({ types: ['Water'] }, 50)
    const weak = makeFighter({ types: ['Water'] }, 5)
    const tackle = move('Normal', 60)
    expect(
      calcDamage({ attacker: weak, defender: weak, move: tackle, roll: 1 })
        .damage
    ).toBe(6)
    expect(
      calcDamage({ attacker: strong, defender: weak, move: tackle, roll: 1 })
        .damage
    ).toBe(186)
  })

  it('uses attack/defense for physical types and the special pair otherwise', () => {
    const attacker = makeFighter({
      attack: 200,
      specialAttack: 10,
      types: ['Water']
    })
    const defender = makeFighter({ defense: 50, specialDefense: 200 })
    expect(
      calcDamage({ attacker, defender, move: move('Rock', 50), roll: 1 }).damage
    ).toBe(baseDamage(50, 50, 205, 55))
    expect(
      calcDamage({ attacker, defender, move: move('Ice', 50), roll: 1 }).damage
    ).toBe(baseDamage(50, 50, 15, 205))
  })

  it('splits categories as the rules list them', () => {
    for (const type of [
      'Normal',
      'Fighting',
      'Ground',
      'Rock',
      'Bug',
      'Ghost',
      'Steel',
      'Poison'
    ] as const) {
      expect(moveCategory(type)).toBe('physical')
    }
    for (const type of [
      'Fire',
      'Water',
      'Grass',
      'Electric',
      'Ice',
      'Psychic',
      'Dragon',
      'Dark',
      'Fairy',
      'Flying'
    ] as const) {
      expect(moveCategory(type)).toBe('special')
    }
  })

  it('does 0 to an immune target and at least 1 otherwise', () => {
    const ghost = makeFighter({ types: ['Ghost'] })
    expect(
      calcDamage({
        attacker: makeFighter(),
        defender: ghost,
        move: move('Normal', 90),
        roll: 1
      })
    ).toEqual({ damage: 0, effectiveness: 0 })
    const weak = makeFighter({ specialAttack: 10 }, 5)
    const wall = makeFighter({
      specialDefense: 230,
      types: ['Water', 'Dragon']
    })
    expect(
      calcDamage({
        attacker: weak,
        defender: wall,
        move: move('Fire', 45),
        roll: 0.85
      })
    ).toEqual({ damage: 1, effectiveness: 0.25 })
  })
})

describe('turnOrder', () => {
  it('lets the faster creature go first without using the rng', () => {
    const rng = scriptedRng()
    expect(turnOrder(120, 80, rng)).toEqual(['player', 'enemy'])
    expect(turnOrder(30, 31, rng)).toEqual(['enemy', 'player'])
  })

  it('breaks a speed tie at random', () => {
    expect(turnOrder(90, 90, scriptedRng(0.2))).toEqual(['player', 'enemy'])
    expect(turnOrder(90, 90, scriptedRng(0.7))).toEqual(['enemy', 'player'])
  })
})

describe('chooseEnemyMove', () => {
  it('picks the highest expected damage 70% of the time', () => {
    expect(
      chooseEnemyMove(makeFighter(), makeFighter(), scriptedRng(0.69))
    ).toBe(3)
  })

  it('accounts for type matchups', () => {
    const enemy = makeFighter({ types: ['Fighting', 'Electric'] })
    expect(
      chooseEnemyMove(enemy, makeFighter({ types: ['Ghost'] }), scriptedRng(0))
    ).toBe(2)
  })

  it('otherwise picks any move at random', () => {
    expect(
      chooseEnemyMove(makeFighter(), makeFighter(), scriptedRng(0.7, 0.5))
    ).toBe(2)
  })
})

describe('wildLevel', () => {
  it('is the team average ±2, clamped to 2–100', () => {
    expect(wildLevel([10, 20], scriptedRng(0))).toBe(13)
    expect(wildLevel([10, 20], scriptedRng(0.99))).toBe(17)
    expect(wildLevel([1], scriptedRng(0))).toBe(2)
    expect(wildLevel([100], scriptedRng(0.99))).toBe(100)
  })
})

describe('resolveTurn', () => {
  const fast = () =>
    makeFighter({ id: 1, name: 'Fast', speed: 120 }, 50, { uid: 'a' })
  const slow = () =>
    makeFighter({ id: 2, name: 'Slow', speed: 80 }, 50, { uid: 'w' })
  const battleOf = (party = [fast()], enemy = slow()) =>
    createBattle(party, enemy)

  it('runs both attacks in speed order', () => {
    const battle = battleOf()
    // AI pick; player hit, crit check, roll; enemy hit, crit check, roll.
    const { events } = resolveTurn(
      battle,
      { index: 1, type: 'move' },
      scriptedRng(0, 0, NO_CRIT, 0, 0, NO_CRIT, 0)
    )
    expect(events).toEqual([
      { move: battle.party[0].moves[1], side: 'player', type: 'move' },
      {
        amount: 35,
        crit: false,
        effectiveness: 1,
        hp: 125,
        target: 'enemy',
        type: 'damage'
      },
      { move: battle.enemy.moves[3], side: 'enemy', type: 'move' },
      {
        amount: 52,
        crit: false,
        effectiveness: 1,
        hp: 108,
        target: 'player',
        type: 'damage'
      }
    ])
    expect(battle.enemy.hp).toBe(160)
  })

  it('records critical hits', () => {
    const { events } = resolveTurn(
      battleOf(),
      { index: 1, type: 'move' },
      scriptedRng(0, 0, 0, 0, 0, NO_CRIT, 0)
    )
    // 28 × 0.85 × 1.5 × 1.5 = 53.
    expect(events[1]).toMatchObject({ amount: 53, crit: true })
  })

  it('applies the timing bonus to the player damage only', () => {
    const { events } = resolveTurn(
      battleOf(),
      { index: 1, timing: 1.25, type: 'move' },
      scriptedRng(0, 0, NO_CRIT, 0, 0, NO_CRIT, 0)
    )
    // 28 × 0.85 × 1.5 × 1.25 = 44; the enemy's hit is unchanged (52).
    expect(events[1]).toMatchObject({ amount: 44, target: 'enemy' })
    expect(events[3]).toMatchObject({ amount: 52, target: 'player' })
  })

  it('caps the timing bonus at 1.25, like friend battles', () => {
    const damage = (timing: number) =>
      resolveTurn(
        battleOf(),
        { index: 1, timing, type: 'move' },
        scriptedRng(0, 0, NO_CRIT, 0, 0, NO_CRIT, 0)
      ).events[1]
    expect(damage(100)).toEqual(damage(1.25))
    expect(damage(-5)).toEqual(damage(1))
  })

  it('records a miss', () => {
    const { events, state } = resolveTurn(
      battleOf(),
      { index: 1, type: 'move' },
      scriptedRng(0, 0.99, 0, NO_CRIT, 0)
    )
    expect(events[1]).toEqual({ side: 'player', type: 'miss' })
    expect(state.enemy.hp).toBe(160)
  })

  it('wins and gives XP when the wild creature faints', () => {
    const battle = battleOf()
    battle.enemy.hp = 10
    const { events, state } = resolveTurn(
      battle,
      { index: 0, type: 'move' },
      scriptedRng(0, 0, NO_CRIT, 0)
    )
    expect(events.slice(-2)).toEqual([
      { side: 'enemy', type: 'faint' },
      // Slow's total is 580: floor(580 / 4) × 50 / 7 = 1035.
      { amount: 1035, name: 'Fast', type: 'xp' }
    ])
    expect(state.winner).toBe('player')
    expect(activeFighter(state).xp).toBe(125_000 + 1035)
    expect(
      resolveTurn(state, { index: 0, type: 'move' }, scriptedRng())
    ).toEqual({ events: [], state })
  })

  it('levels up, raising max HP and current HP together', () => {
    const rookie = makeFighter({ id: 1, name: 'Rookie', speed: 200 }, 5, {
      uid: 'r'
    })
    // A Lv5 speed stat is tiny, so the wild one is slower still.
    const sluggish = makeFighter({ id: 2, speed: 1 }, 50, { uid: 'w' })
    const battle = battleOf([rookie], sluggish)
    battle.enemy.hp = 1
    const { events, state } = resolveTurn(
      battle,
      { index: 0, type: 'move' },
      scriptedRng(0, 0, NO_CRIT, 0)
    )
    // Total 501 → 892 XP; 125 + 892 → Lv10 (1000 ≤ 1017 < 1331); HP 25 → 40.
    expect(events[events.length - 1]).toMatchObject({
      fighter: { hp: 40, level: 10, maxHp: 40 },
      type: 'levelUp'
    })
    expect(activeFighter(state)).toMatchObject({ level: 10, maxHp: 40 })
  })

  it('asks for a switch when the active creature faints and another can fight', () => {
    const weak = makeFighter({ id: 1, name: 'Weak', speed: 10 }, 50, {
      hp: 1,
      uid: 'a'
    })
    const backup = makeFighter({ id: 3, name: 'Backup' }, 50, { uid: 'b' })
    const { events, state } = resolveTurn(
      battleOf([weak, backup]),
      { index: 0, type: 'move' },
      scriptedRng(0, 0, NO_CRIT, 0)
    )
    expect(events[events.length - 1]).toEqual({
      side: 'player',
      type: 'faint'
    })
    expect(state).toMatchObject({ mustSwitch: true, winner: null })
    expect(
      resolveTurn(state, { index: 0, type: 'move' }, scriptedRng()).events
    ).toEqual([])

    const sent = sendOut(state, 1)
    expect(sent.events).toEqual([
      { fighter: sent.state.party[1], from: null, type: 'switch' }
    ])
    expect(sent.state).toMatchObject({ active: 1, mustSwitch: false })
  })

  it('loses only when the whole team has fainted', () => {
    const weak = makeFighter({ id: 1, speed: 10 }, 50, { hp: 1, uid: 'a' })
    const { events, state } = resolveTurn(
      battleOf([weak]),
      { index: 0, type: 'move' },
      scriptedRng(0, 0, NO_CRIT, 0)
    )
    expect(events.slice(-2)).toEqual([
      { side: 'player', type: 'faint' },
      { type: 'blackout' }
    ])
    expect(state.winner).toBe('enemy')
  })

  it('switches before the enemy attacks the new creature', () => {
    const battle = battleOf([
      fast(),
      makeFighter({ id: 3, name: 'Second' }, 50, { uid: 'b' })
    ])
    const { events, state } = resolveTurn(
      battle,
      { to: 1, type: 'switch' },
      scriptedRng(0, 0, NO_CRIT, 0)
    )
    expect(events[0]).toMatchObject({ from: 'Fast', type: 'switch' })
    expect(events[2]).toMatchObject({ target: 'player', type: 'damage' })
    expect(state.active).toBe(1)
    expect(state.party[1].hp).toBeLessThan(160)
    expect(state.party[0].hp).toBe(160)
  })

  it('catches when all four shakes pass, with no enemy attack', () => {
    const { events, state } = resolveTurn(
      battleOf(),
      { type: 'catch' },
      scriptedRng(0, 0, 0, 0)
    )
    expect(events[0]).toEqual({ shakes: 4, type: 'catch' })
    expect(state).toMatchObject({ caught: true, winner: 'player' })
  })

  it('lets the enemy attack after a failed throw', () => {
    const { events, state } = resolveTurn(
      battleOf(),
      { type: 'catch' },
      scriptedRng(0.99, 0, 0, NO_CRIT, 0)
    )
    expect(events[0]).toEqual({ shakes: 0, type: 'catch' })
    expect(events[1]).toMatchObject({ side: 'enemy', type: 'move' })
    expect(state.caught).toBe(false)
  })

  it('refuses to catch with a full team', () => {
    const party = Array.from({ length: MAX_TEAM }, (_, i) =>
      makeFighter({ id: i + 1 }, 50, { uid: `m${i}` })
    )
    expect(() =>
      resolveTurn(battleOf(party), { type: 'catch' }, scriptedRng(0))
    ).toThrow()
  })
})

describe('movesFor', () => {
  const summary = (types: string[]) =>
    movesFor({ types }).map(m => `${m.type}:${m.name}`)

  it('gives 2 main-type moves, 1 second-type move and 1 Normal move', () => {
    const moves = movesFor({ types: ['Fire', 'Flying'] })
    expect(moves.map(m => m.type)).toEqual(['Fire', 'Fire', 'Flying', 'Normal'])
  })

  it('falls back to Normal for a single type', () => {
    expect(movesFor({ types: ['Water'] }).map(m => m.type)).toEqual([
      'Water',
      'Water',
      'Normal',
      'Normal'
    ])
  })

  it('always gives four different moves', () => {
    for (const types of [
      ['Normal'],
      ['Normal', 'Fire'],
      ['Fire', 'Normal'],
      ['Ghost', 'Dark']
    ]) {
      expect(new Set(summary(types)).size).toBe(4)
    }
  })

  it('keeps power 40–90 and accuracy 85–100', () => {
    for (const type of [
      'Bug',
      'Dark',
      'Dragon',
      'Electric',
      'Fairy',
      'Fighting',
      'Fire',
      'Flying',
      'Ghost',
      'Grass',
      'Ground',
      'Ice',
      'Normal',
      'Poison',
      'Psychic',
      'Rock',
      'Steel',
      'Water'
    ]) {
      for (const m of movesFor({ types: [type] })) {
        expect(m.power).toBeGreaterThanOrEqual(40)
        expect(m.power).toBeLessThanOrEqual(90)
        expect(m.accuracy).toBeGreaterThanOrEqual(85)
        expect(m.accuracy).toBeLessThanOrEqual(100)
      }
    }
  })
})
