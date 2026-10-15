import type { Pokemon, PokemonType } from './pokemon'

// Shared by the API (400 above them) and the form inputs (maxLength).
export const MAX_NAME_LENGTH = 30
export const MAX_DESCRIPTION_LENGTH = 200
export const MAX_CREATURE_TYPES = 2

// A full Pokemon minus the id, which the client assigns (they're never stored).
// `imageUrl` is a data: URL of the generated image.
export type CreatedCreature = Omit<Pokemon, 'id'>

export type CreatureRequest = {
  description: string
  name: string
  types: PokemonType[]
}

export type CreatureResponse = { creature: CreatedCreature }
