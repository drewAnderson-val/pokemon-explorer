import express from 'express'

import type { CloseReason, MatchStore } from './matches'
import type { WindowLimiter } from './rate-limit'

type MatchesRouteOptions = {
  perClient: WindowLimiter
  store: MatchStore
}

const PING_MS = 25_000

export function matchesRoute({ perClient, store }: MatchesRouteOptions) {
  const router = express.Router()

  router.post('/api/matches', (req, res) => {
    store.sweep()
    if (!perClient.take(req.ip ?? 'unknown')) {
      res
        .status(429)
        .json({ error: "You've started a lot of matches! Try again later." })
      return
    }
    const created = store.create()
    if (!created) {
      res.status(503).json({ error: 'Too many open matches. Try again soon.' })
      return
    }
    res.status(201).json(created)
  })

  router.post('/api/matches/:id/join', (req, res) => {
    store.sweep()
    const joined = store.join(req.params.id)
    if (!joined.ok) {
      res.status(joined.status).json({
        error: joined.status === 404 ? 'No such match' : 'The match is full'
      })
      return
    }
    res.json({ token: joined.token })
  })

  router.post(
    '/api/matches/:id/actions',
    express.json({ limit: '2kb' }),
    (req, res) => {
      store.sweep()
      const { action, token } = (req.body ?? {}) as Record<string, unknown>
      if (typeof token !== 'string' || action === undefined) {
        res.status(400).json({ error: 'Send a token and an action' })
        return
      }
      const result = store.act(req.params.id, token, action)
      if (!result.ok) {
        res.status(result.status).json({ error: result.error })
        return
      }
      res.status(204).end()
    }
  )

  // Always answers 200: an EventSource can't read an error status, so an
  // unknown match or a bad token gets one `gone` event instead. A stream
  // superseded by a newer one with the same token gets `replaced`.
  router.get('/api/matches/:id/events', (req, res) => {
    store.sweep()
    res.set({
      'Cache-Control': 'no-cache',
      'Content-Type': 'text/event-stream',
      'X-Accel-Buffering': 'no'
    })
    res.flushHeaders()

    // A dead socket must never throw into the store's broadcast.
    const write = (chunk: string) => {
      try {
        res.write(chunk)
      } catch {
        // The close handler cleans up.
      }
    }
    const end = (reason: CloseReason) => {
      clearInterval(ping)
      try {
        res.write(`event: ${reason}\ndata: {}\n\n`)
        res.end()
      } catch {
        // Already closed.
      }
    }

    const ping = setInterval(() => write(': ping\n\n'), PING_MS)
    ping.unref()

    const token = typeof req.query.token === 'string' ? req.query.token : ''
    const unsubscribe = store.subscribe(req.params.id, token, {
      close: end,
      send: view => write(`event: view\ndata: ${JSON.stringify(view)}\n\n`)
    })
    if (!unsubscribe) {
      end('gone')
      return
    }
    res.on('close', () => {
      clearInterval(ping)
      unsubscribe()
    })
  })

  return router
}
