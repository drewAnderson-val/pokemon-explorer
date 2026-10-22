import { useCallback, useEffect, useState } from 'react'

import {
  joinMatch,
  loadToken,
  type MatchAction,
  type MatchView,
  saveToken,
  sendAction
} from '@/lib/versus-api'

export type MatchStatus = 'connecting' | 'full' | 'gone' | 'live'

// Takes a seat in a friend match (or reclaims the one this tab saved) and
// follows the server's stream of views.
export function useMatch(matchId: string) {
  const [state, setState] = useState<{
    status: MatchStatus
    view: MatchView | null
  }>({ status: 'connecting', view: null })

  useEffect(() => {
    // StrictMode runs this twice: only the last run's join and stream count.
    let ignore = false
    let source: EventSource | null = null

    function connect(token: string) {
      source = new EventSource(
        `/api/matches/${matchId}/events?token=${encodeURIComponent(token)}`
      )
      source.addEventListener('view', event => {
        const view = JSON.parse((event).data) as MatchView
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
        const joined = await joinMatch(matchId).catch(
          () => ({ status: 'gone' }) as const
        )
        if (ignore) return
        if ('status' in joined) {
          setState({ status: joined.status, view: null })
          return
        }
        token = joined.token
        saveToken(matchId, token)
      }
      connect(token)
    }

    setState({ status: 'connecting', view: null })
    void start()
    return () => {
      ignore = true
      source?.close()
    }
  }, [matchId])

  const send = useCallback(
    async (action: MatchAction) => {
      const token = loadToken(matchId)
      if (!token) throw new Error('You are not in this match')
      await sendAction(matchId, token, action)
    },
    [matchId]
  )

  return { send, status: state.status, view: state.view }
}
