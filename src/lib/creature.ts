import type { Pokemon, PokemonType } from './pokemon'

// Shared by the API (400 above them) and the form inputs (maxLength).
export const MAX_NAME_LENGTH = 30
export const MAX_DESCRIPTION_LENGTH = 200
export const MAX_CREATURE_TYPES = 2

// A creature before it has an id (the test fake lab rolls these).
export type CreatedCreature = Omit<Pokemon, 'id'>

export type CreatureRequest = {
  description: string
  name: string
  types: PokemonType[]
}
