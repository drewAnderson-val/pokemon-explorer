import type { Pokemon, PokemonType } from './pokemon'

// Shared by the API (400 above them) and the form inputs (maxLength).
export const MAX_NAME_LENGTH = 30
export const MAX_DESCRIPTION_LENGTH = 200
export const MAX_CREATURE_TYPES = 2

// The Express lab's answer (server/, deleted in slice 8): a full Pokemon minus
// the id, with a data: URL image. The FastAPI lab returns the stored creature.
export type CreatedCreature = Omit<Pokemon, 'id'>

export type CreatureRequest = {
  description: string
  name: string
  types: PokemonType[]
}

export type CreatureResponse = { creature: CreatedCreature }
