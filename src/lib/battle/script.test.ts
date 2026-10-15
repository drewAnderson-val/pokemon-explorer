import { describe, expect, it } from 'vitest'

import { makeFighter } from '@/test/battle'

import { type BattleEvent, createBattle } from './engine'
import { effectivenessText, introSteps, stepsFor } from './script'

const sparky = makeFighter({ name: 'Sparky', types: ['Electric'] }, 5, {
  uid: 'p'
})
const puddle = makeFighter({ id: 2, name: 'Puddle', types: ['Water'] }, 4, {
  uid: 'w'
})
const battle = createBattle([sparky], puddle)

describe('introSteps', () => {
  it('announces the wild creature, then sends out the player', () => {
    expect(introSteps(battle).map(s => s.text)).toEqual([
      'A wild Puddle appeared!',
      'Go! Sparky!'
    ])
  })
})

describe('effectivenessText', () => {
  it('has a line for every multiplier except 1x', () => {
    expect(effectivenessText(4, 'X')).toBe("It's super effective!")
    expect(effectivenessText(1, 'X')).toBeNull()
    expect(effectivenessText(0.25, 'X')).toBe("It's not very effective…")
    expect(effectivenessText(0, 'Wild X')).toBe("It doesn't affect Wild X…")
  })
})

describe('stepsFor', () => {
  const steps = (events: BattleEvent[]) => stepsFor(battle, events)

  it('attaches damage to the "used" line, then crit and effectiveness lines', () => {
    expect(
      steps([
        { move: sparky.moves[0], side: 'player', type: 'move' },
        {
          amount: 9,
          crit: true,
          effectiveness: 2,
          hp: 10,
          target: 'enemy',
          type: 'damage'
        }
      ])
    ).toEqual([
      {
        cue: 'crit',
        damage: { amount: 9, crit: true, side: 'enemy' },
        hit: 'player',
        hp: { side: 'enemy', value: 10 },
        text: 'Sparky used Static Snap!'
      },
      { text: 'A critical hit!' },
      { at: 'enemy', cue: 'super', text: "It's super effective!" }
    ])
  })

  it('describes switching, XP and level-ups, showing the new fighter', () => {
    const grown = { ...sparky, hp: 30, level: 6 }
    expect(
      steps([
        { fighter: sparky, from: 'Old', type: 'switch' },
        { fighter: sparky, from: null, type: 'switch' },
        { amount: 42, name: 'Sparky', type: 'xp' },
        { fighter: grown, type: 'levelUp' }
      ])
    ).toEqual([
      {
        show: { fighter: sparky, side: 'player' },
        text: 'Come back, Old! Go, Sparky!'
      },
      { show: { fighter: sparky, side: 'player' }, text: 'Go! Sparky!' },
      { text: 'Sparky gained 42 XP!' },
      {
        cue: 'levelUp',
        show: { fighter: grown, side: 'player' },
        text: 'Sparky grew to Lv6!'
      }
    ])
  })

  it('shakes up to three times, then catches or breaks free', () => {
    expect(steps([{ shakes: 4, type: 'catch' }]).map(s => s.text)).toEqual([
      'You threw a ball!',
      'The ball shook…',
      'The ball shook…',
      'The ball shook…',
      'Gotcha! Wild Puddle was caught!'
    ])
    expect(steps([{ shakes: 4, type: 'catch' }]).map(s => s.cue)).toEqual([
      'throw',
      'shake',
      'shake',
      'shake',
      'caught'
    ])
    expect(steps([{ shakes: 4, type: 'catch' }]).pop()).toMatchObject({
      faint: 'enemy'
    })
    expect(steps([{ shakes: 0, type: 'catch' }]).pop()).toMatchObject({
      cue: 'breakFree'
    })
    expect(steps([{ shakes: 1, type: 'catch' }]).map(s => s.text)).toEqual([
      'You threw a ball!',
      'The ball shook…',
      'Oh no! It broke free!'
    ])
  })

  it('ends with faint and blackout lines', () => {
    expect(
      steps([{ side: 'player', type: 'faint' }, { type: 'blackout' }])
    ).toEqual([
      { cue: 'faint', faint: 'player', text: 'Sparky fainted!' },
      { text: "You're out of creatures!" }
    ])
  })
})
