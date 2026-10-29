import type { BattleEvent, BattleState } from './engine'

import { authFetch } from '../auth'

export type TurnResult = WildBattle & { events: BattleEvent[] }

export type WildAction =
  | { index: number; timing?: number; type: 'move' }
  | { to: number; type: 'sendOut' }
  | { to: number; type: 'switch' }
  | { type: 'catch' }

// Wild battles are played by the server (/api/battles/wild): the browser sends
// one action at a time, naming the turn it's for, and plays back the events.
export type WildBattle = { state: BattleState; turn: number }

// `status` lets the screen tell a refusal (4xx, with the server's reason) from
// the server or network failing (5xx).
export class BattleRequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

export async function abandonWildBattle() {
  await authFetch('/api/battles/wild', { method: 'DELETE' })
}

// The battle in progress, or null when there isn't one.
export async function fetchWildBattle(): Promise<null | WildBattle> {
  const response = await authFetch('/api/battles/wild')
  if (response.status === 404) return null
  return read<WildBattle>(response)
}

export async function sendWildAction(
  turn: number,
  action: WildAction
): Promise<TurnResult> {
  return read<TurnResult>(
    await authFetch('/api/battles/wild/actions', {
      body: JSON.stringify({ action, turn }),
      headers: { 'content-type': 'application/json' },
      method: 'POST'
    })
  )
}

export async function startWildBattle(): Promise<WildBattle> {
  return read<WildBattle>(
    await authFetch('/api/battles/wild', { method: 'POST' })
  )
}

async function read<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as
    | null
    | T
    | { error?: string }
  if (!response.ok || body === null) {
    const message =
      body && typeof body === 'object' && 'error' in body
        ? body.error
        : undefined
    throw new BattleRequestError(
      message ?? `Battle request failed (${response.status})`,
      response.status
    )
  }
  return body as T
}
