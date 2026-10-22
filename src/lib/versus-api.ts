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

export const tokenKey = (matchId: string) => `pokemon-explorer:match:${matchId}`

export const matchPath = (matchId: string) => `/battle/vs/${matchId}`

// Errors carry the API's message, which is written for people to read.
export async function createMatch(): Promise<{
  matchId: string
  token: string
}> {
  const response = await fetch('/api/matches', { method: 'POST' })
  if (!response.ok) {
    throw new Error(await errorMessage(response, 'Could not create the match'))
  }
  return response.json()
}

export async function joinMatch(
  matchId: string
): Promise<{ status: 'full' | 'gone' } | { token: string }> {
  const response = await fetch(`/api/matches/${matchId}/join`, {
    method: 'POST'
  })
  if (response.status === 404) return { status: 'gone' }
  if (response.status === 409) return { status: 'full' }
  if (!response.ok) {
    throw new Error(await errorMessage(response, 'Could not join the match'))
  }
  return response.json()
}

// Seat tokens live in sessionStorage so each tab holds its own seat.
export function loadToken(matchId: string): null | string {
  try {
    return window.sessionStorage.getItem(tokenKey(matchId))
  } catch {
    return null
  }
}

export function saveToken(matchId: string, token: string) {
  try {
    window.sessionStorage.setItem(tokenKey(matchId), token)
  } catch {
    // Blocked storage: this tab can't rejoin after a reload.
  }
}

export async function sendAction(
  matchId: string,
  token: string,
  action: MatchAction
): Promise<void> {
  const response = await fetch(`/api/matches/${matchId}/actions`, {
    body: JSON.stringify({ action, token }),
    headers: { 'content-type': 'application/json' },
    method: 'POST'
  })
  if (!response.ok) {
    throw new Error(await errorMessage(response, 'Could not send that move'))
  }
}

async function errorMessage(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as null | {
    error?: string
  }
  return body?.error ?? `${fallback} (${response.status})`
}
