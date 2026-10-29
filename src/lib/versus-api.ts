import type { BattleEvent, BattleState } from './battle/engine'
import type { Seat } from './battle/versus'

import { API_BASE } from './api'
import { authFetch } from './auth'

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

export const matchPath = (matchId: string) => `/battle/vs/${matchId}`

// The match's live views. EventSource can't send headers, so the account's
// token goes in the query string (it's only ever this user's own view).
export const matchEventsUrl = (matchId: string, token: string) =>
  `${API_BASE}/api/matches/${matchId}/events?token=${encodeURIComponent(token)}`

// Errors carry the API's message, which is written for people to read.
export async function createMatch(): Promise<{ matchId: string }> {
  const response = await authFetch('/api/matches', { method: 'POST' })
  if (!response.ok) {
    throw new Error(await errorMessage(response, 'Could not create the match'))
  }
  return (await response.json()) as { matchId: string }
}

// Takes the guest seat, or confirms the seat you already have (joining again
// is harmless, so a reload or a second tab just carries on).
export async function joinMatch(
  matchId: string
): Promise<{ seat: Seat } | { status: 'full' | 'gone' }> {
  const response = await authFetch(`/api/matches/${matchId}/join`, {
    method: 'POST'
  })
  if (response.status === 404) return { status: 'gone' }
  if (response.status === 409) return { status: 'full' }
  if (!response.ok) {
    throw new Error(await errorMessage(response, 'Could not join the match'))
  }
  return (await response.json()) as { seat: Seat }
}

// Moves, switches and send-outs carry an idempotency key. If the network drops
// the request, it's sent once more with the same key: when the first one did
// reach the server, the server answers the retry without playing it twice.
export async function sendAction(
  matchId: string,
  action: MatchAction
): Promise<void> {
  const key =
    action.type === 'move' ||
    action.type === 'switch' ||
    action.type === 'sendOut'
      ? crypto.randomUUID()
      : null
  const send = () =>
    authFetch(`/api/matches/${matchId}/actions`, {
      body: JSON.stringify({ action }),
      headers: {
        'content-type': 'application/json',
        ...(key ? { 'Idempotency-Key': key } : {})
      },
      method: 'POST'
    })
  let response: Response
  try {
    response = await send()
  } catch (error) {
    if (!key) throw error
    response = await send()
  }
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
