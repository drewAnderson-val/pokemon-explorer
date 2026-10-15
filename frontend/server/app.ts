import express from 'express'

import pokemonData from '../src/data/pokemon.json'

const app = express()

app.get('/api/pokemon', (req, res) => {
  const page = parseInt((req.query.page as string) || '1')
  const limit = parseInt((req.query.limit as string) || '20')
  const search = (req.query.search as string) || ''

  let filteredPokemon = pokemonData

  if (search) {
    filteredPokemon = pokemonData.filter(
      pokemon =>
        pokemon.name.toLowerCase().includes(search.toLowerCase()) ||
        pokemon.types.some(type =>
          type.toLowerCase().includes(search.toLowerCase())
        ) ||
        pokemon.description.toLowerCase().includes(search.toLowerCase())
    )
  }

  const total = filteredPokemon.length
  const totalPages = Math.ceil(total / limit)
  const startIndex = (page - 1) * limit
  const endIndex = startIndex + limit
  const paginatedPokemon = filteredPokemon.slice(startIndex, endIndex)

  res.json({
    data: paginatedPokemon,
    pagination: {
      hasNext: page < totalPages,
      hasPrev: page > 1,
      limit,
      page,
      total,
      totalPages
    }
  })
})

export default app
