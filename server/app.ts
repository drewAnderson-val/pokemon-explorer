import express from 'express'

import type { Pokemon } from '../src/lib/pokemon'

import pokemonData from '../src/data/pokemon.json'
import { parsePokemonQuery, queryPokemon } from '../src/lib/query'
import { creaturesRoute } from './creatures-route'
import {
  createVertexImageGenerator,
  type ImageGenerator
} from './image-generator'
import { createMatchStore } from './matches'
import { matchesRoute } from './matches-route'
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

// pokemon.json only, so Creature Lab creatures can't enter a friend match.
const matchStore = createMatchStore({
  creatures: new Map(pokemon.map(p => [p.id, p])),
  maxOpen: 500
})
setInterval(() => matchStore.sweep(), 5_000).unref()
app.use(
  matchesRoute({
    perClient: createWindowLimiter(20, HOUR),
    store: matchStore
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

// Same contract as the FastAPI route, for builds without VITE_API_URL.
app.get('/api/pokemon/:id', (req, res) => {
  const found = pokemon.find(p => String(p.id) === req.params.id)
  if (!found) {
    res.status(404).json({ error: `No creature #${req.params.id}` })
    return
  }
  res.json(found)
})

export default app
