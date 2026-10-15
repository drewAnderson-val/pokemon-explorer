import express from 'express'

import type { Pokemon } from '../src/lib/pokemon'

import pokemonData from '../src/data/pokemon.json'
import { parsePokemonQuery, queryPokemon } from './query'

const pokemon = pokemonData as Pokemon[]

const app = express()

app.get('/api/pokemon', (req, res) => {
  const parsed = parsePokemonQuery(req.query)
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error })
    return
  }
  res.json(queryPokemon(pokemon, parsed.query))
})

export default app
