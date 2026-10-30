// The Express lab's request checks and stat roll, kept for the fake server only:
// the real ones are the API's (api/app/lab/request.py).
import {
  type CreatedCreature,
  type CreatureRequest,
  MAX_CREATURE_TYPES,
  MAX_DESCRIPTION_LENGTH,
  MAX_NAME_LENGTH
} from '@/lib/creature'
import { isPokemonType, type PokemonType } from '@/lib/pokemon'

type ParseResult =
  | { error: string; ok: false }
  | { ok: true; request: CreatureRequest }

const fail = (error: string): ParseResult => ({ error, ok: false })

// Flattens newlines and quotes, as the API's lab does.
const clean = (text: string) =>
  text
    .replace(/["“”\n\r\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

type Random = () => number

export function parseCreatureRequest(body: unknown): ParseResult {
  if (typeof body !== 'object' || body === null) {
    return fail('body must be a JSON object')
  }
  const raw = body as Record<string, unknown>

  if (typeof raw.name !== 'string') return fail('name is required')
  if (raw.name.length > MAX_NAME_LENGTH) {
    return fail(`name must be at most ${MAX_NAME_LENGTH} characters`)
  }
  const name = clean(raw.name)
  if (name === '') return fail('name is required')

  if (
    !Array.isArray(raw.types) ||
    raw.types.length < 1 ||
    raw.types.length > MAX_CREATURE_TYPES
  ) {
    return fail(`types must list 1 to ${MAX_CREATURE_TYPES} types`)
  }
  const types: PokemonType[] = []
  for (const type of raw.types) {
    if (typeof type !== 'string' || !isPokemonType(type)) {
      return fail(`unknown type: ${String(type)}`)
    }
    if (!types.includes(type)) types.push(type)
  }

  const rawDescription = raw.description ?? ''
  if (typeof rawDescription !== 'string') {
    return fail('description must be a string')
  }
  if (rawDescription.length > MAX_DESCRIPTION_LENGTH) {
    return fail(
      `description must be at most ${MAX_DESCRIPTION_LENGTH} characters`
    )
  }

  return {
    ok: true,
    request: { description: clean(rawDescription), name, types }
  }
}

const between = (random: Random, min: number, max: number) =>
  min + Math.floor(random() * (max - min + 1))

// Stats are flavour, rolled in the same ranges as the catalog's.
export function rollCreature(
  { description, name, types }: CreatureRequest,
  imageUrl: string,
  random: Random = Math.random
): CreatedCreature {
  return {
    attack: between(random, 20, 150),
    defense: between(random, 20, 150),
    description:
      description || `A newly discovered ${types.join('/')}-type creature.`,
    generation: 10,
    height: between(random, 3, 30) / 10,
    hp: between(random, 30, 150),
    imageUrl,
    isLegendary: false,
    name,
    specialAttack: between(random, 20, 150),
    specialDefense: between(random, 20, 150),
    speed: between(random, 20, 150),
    types,
    weight: between(random, 10, 1500) / 10
  }
}
