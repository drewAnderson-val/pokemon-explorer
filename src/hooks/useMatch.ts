import { useCallback, useEffect, useState } from 'react'

import {
  joinMatch,
  loadToken,
  type MatchAction,
  type MatchView,
  saveToken,
  sendAction
} from '@/lib/versus-api'

export type MatchStatus = 'connecting' | 'error' | 'full' | 'gone' | 'live'

// One join per match at a time, so StrictMode's second effect run awaits the
// first run's join instead of posting again (which would answer 409). The
// token is saved when the join resolves, whether or not a run is still alive.
const joins = new Map<string, ReturnType<typeof joinMatch>>()

// Takes a seat in a friend match (or reclaims the one this tab saved) and
// follows the server's stream of views.
export function useMatch(matchId: string) {
  const [state, setState] = useState<{
    status: MatchStatus
    view: MatchView | null
  }>({ status: 'connecting', view: null })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    // StrictMode runs this twice: only the last run's join and stream count.
    let ignore = false
    let source: EventSource | null = null

    function connect(token: string) {
      source = new EventSource(
        `/api/matches/${matchId}/events?token=${encodeURIComponent(token)}`
      )
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
      // Terminal, including when the same token opens a newer stream. Closing
      // stops the browser's auto-reconnect. Plain network errors are left to
      // it, which is how a Cloud Run request timeout is survived.
      source.addEventListener('gone', () => {
        source?.close()
        setState(previous => ({ ...previous, status: 'gone' }))
      })
    }

    async function start() {
      let token = loadToken(matchId)
      if (!token) {
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
        token = joined.token
      }
      connect(token)
    }

    setState({ status: 'connecting', view: null })
    void start()
    return () => {
      ignore = true
      source?.close()
    }
  }, [matchId, attempt])

  const retry = useCallback(() => setAttempt(count => count + 1), [])

  const send = useCallback(
    async (action: MatchAction) => {
      const token = loadToken(matchId)
      if (!token) throw new Error('You are not in this match')
      await sendAction(matchId, token, action)
    },
    [matchId]
  )

  return { retry, send, status: state.status, view: state.view }
}

function joinOnce(matchId: string) {
  let join = joins.get(matchId)
  if (!join) {
    join = joinMatch(matchId)
      .then(joined => {
        if ('token' in joined) saveToken(matchId, joined.token)
        return joined
      })
      .finally(() => joins.delete(matchId))
    joins.set(matchId, join)
  }
  return join
}
