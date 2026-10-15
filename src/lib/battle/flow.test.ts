import { describe, expect, it } from 'vitest'

import { makeFighter, scriptedRng } from '@/test/battle'

import { createBattle, resolveTurn, sendOut } from './engine'
import { currentStep, flowReducer, type FlowState, startFlow } from './flow'

const NO_CRIT = 0.5
const wild = () => makeFighter({ id: 2 }, 50, { uid: 'w' })

function readAll(state: FlowState) {
  let next = state
  while (next.phase === 'messages') {
    next = flowReducer(next, { type: 'advance' })
  }
  return next
}

describe('flowReducer', () => {
  it('opens the team list and goes back to the menu', () => {
    const flow = readAll(startFlow(createBattle([makeFighter()], wild())))
    expect(flow.phase).toBe('menu')
    const team = flowReducer(flow, { type: 'team' })
    expect(team.phase).toBe('team')
    expect(flowReducer(team, { type: 'back' }).phase).toBe('menu')
  })

  it('goes to the forced switch after a faint, then shows the new creature', () => {
    const weak = makeFighter({ name: 'Weak', speed: 1 }, 50, {
      hp: 1,
      uid: 'a'
    })
    const backup = makeFighter({ id: 3, name: 'Backup' }, 50, { uid: 'b' })
    let flow = readAll(startFlow(createBattle([weak, backup], wild())))
    flow = flowReducer(flow, { type: 'fight' })
    const turn = resolveTurn(
      flow.battle,
      { index: 0, type: 'move' },
      scriptedRng(0, 0, NO_CRIT, 0)
    )
    flow = readAll(flowReducer(flow, { type: 'resolved', ...turn }))
    expect(flow.phase).toBe('switch')
    expect(flow.fainted.player).toBe(true)

    flow = flowReducer(flow, { type: 'resolved', ...sendOut(flow.battle, 1) })
    expect(currentStep(flow)?.text).toBe('Go! Backup!')
    expect(flow.shown.player.uid).toBe('b')
    expect(flow.fainted.player).toBe(false)
    expect(readAll(flow).phase).toBe('menu')
  })

  it('ends as caught after a successful throw', () => {
    let flow = readAll(startFlow(createBattle([makeFighter()], wild())))
    const turn = resolveTurn(
      flow.battle,
      { type: 'catch' },
      scriptedRng(0, 0, 0, 0)
    )
    flow = readAll(flowReducer(flow, { type: 'resolved', ...turn }))
    expect(flow).toMatchObject({ outcome: 'caught', phase: 'end' })
  })
})
