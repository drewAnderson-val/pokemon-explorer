import {
  activeFighter,
  type BattleEvent,
  type BattleState,
  type Fighter,
  type Side
} from './engine'
import { introSteps, type Step, stepsFor } from './script'

export type FlowAction =
  | { events: BattleEvent[]; state: BattleState; type: 'resolved' }
  | { type: 'advance' }
  | { type: 'back' }
  | { type: 'fight' }
  | { type: 'run' }
  | { type: 'team' }

export type FlowState = {
  // Where to go when the message queue runs out.
  after: 'end' | 'menu' | 'switch'
  battle: BattleState
  fainted: Record<Side, boolean>
  index: number
  // Increments each time a message is shown, so repeated text retypes.
  messageId: number
  outcome: null | Outcome
  phase: Phase
  // What the scene shows: changes only when the message that causes it shows.
  shown: Record<Side, Fighter>
  shownHp: Record<Side, number>
  steps: Step[]
}

export type Outcome = 'caught' | 'lost' | 'ran' | 'won'

// The screen's state machine on top of the pure rules: queued messages, what
// the scene shows, and which menu is open. Pure (the caller resolves turns
// with its rng) so StrictMode's double reducer calls are safe.
export type Phase = 'end' | 'menu' | 'messages' | 'moves' | 'switch' | 'team'

// Phases from which a resolved turn (or a send-out) is accepted.
export const ACTING: readonly Phase[] = ['menu', 'moves', 'switch', 'team']

export function currentStep(state: FlowState): Step | undefined {
  return state.phase === 'messages' ? state.steps[state.index] : undefined
}

export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case 'advance': {
      if (state.phase !== 'messages') return state
      if (state.index + 1 < state.steps.length) {
        return enter(state, state.index + 1)
      }
      return { ...state, phase: state.after }
    }
    case 'back':
      return state.phase === 'moves' || state.phase === 'team'
        ? { ...state, phase: 'menu' }
        : state
    case 'fight':
      return state.phase === 'menu' ? { ...state, phase: 'moves' } : state
    case 'resolved': {
      if (!ACTING.includes(state.phase) || action.events.length === 0) {
        return state
      }
      const { winner } = action.state
      const after = winner ? 'end' : action.state.mustSwitch ? 'switch' : 'menu'
      return queue(
        { ...state, battle: action.state },
        stepsFor(action.state, action.events),
        after,
        outcomeOf(action.state)
      )
    }
    case 'run':
      if (state.phase !== 'menu') return state
      return queue(state, [{ text: 'Got away safely!' }], 'end', 'ran')
    case 'team':
      return state.phase === 'menu' ? { ...state, phase: 'team' } : state
  }
}

export function startFlow(battle: BattleState): FlowState {
  const player = activeFighter(battle)
  return enter(
    {
      after: 'menu',
      battle,
      fainted: { enemy: false, player: false },
      index: 0,
      messageId: 0,
      outcome: null,
      phase: 'messages',
      shown: { enemy: battle.enemy, player },
      shownHp: { enemy: battle.enemy.hp, player: player.hp },
      steps: introSteps(battle)
    },
    0
  )
}

// Show step `index` and apply its effects to the scene.
function enter(state: FlowState, index: number): FlowState {
  const step = state.steps[index]
  if (!step) return state
  let { fainted, shown, shownHp } = state
  if (step.show) {
    const { fighter, side } = step.show
    shown = { ...shown, [side]: fighter }
    shownHp = { ...shownHp, [side]: fighter.hp }
    fainted = { ...fainted, [side]: fighter.hp === 0 }
  }
  if (step.hp) shownHp = { ...shownHp, [step.hp.side]: step.hp.value }
  if (step.faint) fainted = { ...fainted, [step.faint]: true }
  return {
    ...state,
    fainted,
    index,
    messageId: state.messageId + 1,
    phase: 'messages',
    shown,
    shownHp
  }
}

function outcomeOf(state: BattleState): null | Outcome {
  if (state.winner === 'enemy') return 'lost'
  if (state.winner === 'player') return state.caught ? 'caught' : 'won'
  return null
}

function queue(
  state: FlowState,
  steps: Step[],
  after: FlowState['after'],
  outcome: null | Outcome
): FlowState {
  return enter({ ...state, after, outcome, steps }, 0)
}
