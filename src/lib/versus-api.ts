import type { BattleEvent, BattleState } from './battle/engine'
import type { Seat } from './battle/versus'

// Wire types shared by the match routes and the friend battle client.
export type MatchAction =
  | { creatureIds: number[]; type: 'team' }
  | { index: number; timing: number; type: 'move' }
  | { to: number; type: 'sendOut' }
  | { to: number; type: 'switch' }
  | { type: 'forfeit' }

export type MatchOutcome = {
  reason: 'forfeit' | 'knockout' | 'left'
  winner: 'them' | 'you'
}

// One player's view of a match. The opponent's team is never in it before the
// battle; after, only their active creature (as `battle.enemy`) and a count.
export type MatchView = {
  // You've chosen this turn's action.
  acted: boolean
  // From your side; null before the battle.
  battle: BattleState | null
  // The turn that produced `battle`, from your side.
  events: BattleEvent[]
  opponent: {
    acted: boolean
    connected: boolean
    joined: boolean
    ready: boolean
    standing: number
    switching: boolean
  }
  outcome: MatchOutcome | null
  phase: 'battle' | 'over' | 'picking' | 'waiting'
  // Your team is locked in.
  ready: boolean
  // 0 until the battle starts; +1 per resolved turn or send-out.
  turn: number
  you: Seat
}
