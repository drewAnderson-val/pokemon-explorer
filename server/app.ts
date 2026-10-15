import express from 'express'

import type { Pokemon } from '../src/lib/pokemon'

import pokemonData from '../src/data/pokemon.json'
import { creaturesRoute } from './creatures-route'
import {
  createVertexImageGenerator,
  type ImageGenerator
} from './image-generator'
import { parsePokemonQuery, queryPokemon } from './query'
import { createWindowLimiter } from './rate-limit'

const pokemon = pokemonData as Pokemon[]
const HOUR = 60 * 60_000

const app = express()

// Cloud Run sits behind one Google front end; trust it for req.ip so the
// per-client limit sees the caller, not the proxy.
app.set('trust proxy', 1)

// Created on first use so importing the app (Vite, tests) needs no GCP credentials.
let generator: ImageGenerator | null | undefined
app.use(
  creaturesRoute({
    getGenerator: () => {
      if (generator === undefined) {
        const project = process.env.GOOGLE_CLOUD_PROJECT
        generator = project
          ? createVertexImageGenerator({
              model: process.env.IMAGE_MODEL ?? 'gemini-3.1-flash-lite-image',
              project
            })
          : null
      }
      return generator
    },
    global: createWindowLimiter(100, 24 * HOUR),
    perClient: createWindowLimiter(5, HOUR)
  })
)

app.get('/api/pokemon', (req, res) => {
  const parsed = parsePokemonQuery(req.query)
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error })
    return
  }
  res.json(queryPokemon(pokemon, parsed.query))
})

export default app
