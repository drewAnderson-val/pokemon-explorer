import express from 'express'

import type { CreatureResponse } from '../src/lib/creature'
import type { WindowLimiter } from './rate-limit'

import { buildPrompt, parseCreatureRequest, rollCreature } from './create'
import { ImageBlockedError, type ImageGenerator } from './image-generator'

type CreaturesRouteOptions = {
  // null when the server has no GCP project configured.
  getGenerator: () => ImageGenerator | null
  // Overall cap: every image costs money and the app is public.
  global: WindowLimiter
  perClient: WindowLimiter
}

export function creaturesRoute({
  getGenerator,
  global,
  perClient
}: CreaturesRouteOptions) {
  const router = express.Router()

  router.post(
    '/api/creatures',
    express.json({ limit: '4kb' }),
    async (req, res) => {
      const parsed = parseCreatureRequest(req.body)
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error })
        return
      }
      const generator = getGenerator()
      if (!generator) {
        res
          .status(503)
          .json({ error: 'The creature lab is not configured here.' })
        return
      }
      if (!perClient.take(req.ip ?? 'unknown')) {
        res.status(429).json({
          error: "You've made a lot of creatures! Try again in an hour."
        })
        return
      }
      if (!global.take('all')) {
        res.status(429).json({
          error: 'The creature lab is closed for today. Come back tomorrow!'
        })
        return
      }

      try {
        const image = await generator(buildPrompt(parsed.request))
        const body: CreatureResponse = {
          creature: rollCreature(
            parsed.request,
            `data:${image.mimeType};base64,${image.base64}`
          )
        }
        res.json(body)
      } catch (error) {
        if (error instanceof ImageBlockedError) {
          res.status(422).json({
            error: "That creature couldn't be drawn. Try a different idea."
          })
          return
        }
        console.error('Image generation failed', error)
        res
          .status(502)
          .json({ error: 'The drawing machine jammed. Try again.' })
      }
    }
  )

  return router
}
