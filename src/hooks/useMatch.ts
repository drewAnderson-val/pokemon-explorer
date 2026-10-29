import { useCallback, useEffect, useState } from 'react'

import { currentSession } from '@/lib/auth'
import {
  joinMatch,
  type MatchAction,
  matchEventsUrl,
  type MatchView,
  sendAction
} from '@/lib/versus-api'

import { useAuth } from './useAuth'

export type MatchStatus =
  | 'connecting'
  | 'error'
  | 'full'
  | 'gone'
  | 'live'
  | 'replaced'
  // Signed out, or the account's token expired: sign in to carry on.
  | 'signin'

// One join per match at a time, so StrictMode's second effect run awaits the
// first run's join instead of posting again.
const joins = new Map<string, ReturnType<typeof joinMatch>>()

// Takes your seat in a friend match (joining is harmless if you have one) and
// follows the server's stream of views.
export function useMatch(matchId: string) {
  const [state, setState] = useState<{
    status: MatchStatus
    view: MatchView | null
  }>({ status: 'connecting', view: null })
  const [attempt, setAttempt] = useState(0)
  const token = useAuth()?.token ?? null

  useEffect(() => {
    // StrictMode runs this twice: only the last run's join and stream count.
    let ignore = false
    let source: EventSource | null = null

    function connect(sessionToken: string) {
      source = new EventSource(matchEventsUrl(matchId, sessionToken))
      source.addEventListener('view', event => {
        let view: MatchView
        try {
          view = JSON.parse(event.data as string) as MatchView
        } catch {
          console.warn('Ignored a malformed match view')
          return
        }
        setState({ status: 'live', view })
      })
      // Terminal. Closing stops the browser's auto-reconnect. A finished
      // match keeps its end screen when the server drops it.
      source.addEventListener('gone', () => {
        source?.close()
        setState(previous =>
          previous.view?.phase === 'over'
            ? previous
            : { ...previous, status: 'gone' }
        )
      })
      // The token expired (it lasts an hour): sign in again to carry on.
      source.addEventListener('unauthorized', () => {
        source?.close()
        setState(previous => ({ ...previous, status: 'signin' }))
      })
      // A newer stream took the seat (another tab, usually).
      source.addEventListener('replaced', () => {
        source?.close()
        setState(previous => ({ ...previous, status: 'replaced' }))
      })
      // Plain network errors are left to the browser's auto-reconnect, which
      // is how a Cloud Run request timeout is survived. Once it gives up
      // (an error status on reconnect), `retry` opens a new stream.
      source.addEventListener('error', () => {
        if (source?.readyState !== EventSource.CLOSED) return
        setState(previous => ({ ...previous, status: 'error' }))
      })
    }

    async function start() {
      const session = currentSession()
      if (!session) {
        setState({ status: 'signin', view: null })
        return
      }
      let joined: Awaited<ReturnType<typeof joinMatch>>
      try {
        joined = await joinOnce(matchId)
      } catch (error) {
        console.error('Could not join the match', error)
        if (!ignore) setState({ status: 'error', view: null })
        return
      }
      if (ignore) return
      if ('status' in joined) {
        setState({ status: joined.status, view: null })
        return
      }
      connect(session.token)
    }

    setState({ status: 'connecting', view: null })
    void start()
    return () => {
      ignore = true
      source?.close()
    }
  }, [matchId, attempt, token])

  const retry = useCallback(() => setAttempt(count => count + 1), [])
  const send = useCallback(
    (action: MatchAction) => sendAction(matchId, action),
    [matchId]
  )
  return { retry, send, status: state.status, view: state.view }
}

function joinOnce(matchId: string) {
  let join = joins.get(matchId)
  if (!join) {
    join = joinMatch(matchId).finally(() => joins.delete(matchId))
    joins.set(matchId, join)
  }
  return join
}
