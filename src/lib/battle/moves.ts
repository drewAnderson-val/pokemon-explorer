import type { Pokemon, PokemonType } from '../pokemon'

import { isPokemonType } from '../pokemon'

export type Move = {
  accuracy: number
  name: string
  power: number
  type: PokemonType
}

export type MoveCategory = 'physical' | 'special'

// Physical types hit with attack vs defense; the rest use the special pair.
const PHYSICAL_TYPES: ReadonlySet<PokemonType> = new Set([
  'Bug',
  'Fighting',
  'Ghost',
  'Ground',
  'Normal',
  'Poison',
  'Rock',
  'Steel'
])

type MoveSpec = [name: string, power: number, accuracy: number]

export function moveCategory(type: PokemonType): MoveCategory {
  return PHYSICAL_TYPES.has(type) ? 'physical' : 'special'
}

// The API has no moves, so each type gets a small original set: a reliable
// one and a stronger, less accurate one. Normal has four so a pure Normal
// creature still gets four different moves.
const MOVES_BY_TYPE: Record<PokemonType, readonly MoveSpec[]> = {
  Bug: [
    ['Swarm Nip', 50, 100],
    ['Carapace Ram', 80, 90]
  ],
  Dark: [
    ['Sly Swipe', 55, 100],
    ['Night Lunge', 80, 90]
  ],
  Dragon: [
    ['Scale Rush', 60, 100],
    ['Wyrm Roar', 90, 85]
  ],
  Electric: [
    ['Static Snap', 45, 100],
    ['Volt Crash', 85, 90]
  ],
  Fairy: [
    ['Glimmer', 50, 100],
    ['Moonbeam Burst', 85, 90]
  ],
  Fighting: [
    ['Palm Strike', 50, 100],
    ['Rising Knee', 85, 85]
  ],
  Fire: [
    ['Cinder Flick', 45, 100],
    ['Blaze Burst', 85, 90]
  ],
  Flying: [
    ['Gust Slice', 50, 100],
    ['Sky Dive', 85, 90]
  ],
  Ghost: [
    ['Shade Tap', 50, 100],
    ['Phantom Grip', 80, 90]
  ],
  Grass: [
    ['Leaf Flick', 45, 100],
    ['Bramble Lash', 85, 90]
  ],
  Ground: [
    ['Mud Toss', 50, 100],
    ['Quake Stomp', 90, 85]
  ],
  Ice: [
    ['Frost Nip', 45, 100],
    ['Glacier Spear', 85, 90]
  ],
  Normal: [
    ['Quick Tackle', 40, 100],
    ['Body Check', 60, 95],
    ['Wild Swing', 75, 90],
    ['Heavy Slam', 90, 85]
  ],
  Poison: [
    ['Toxic Jab', 50, 100],
    ['Venom Wave', 80, 90]
  ],
  Psychic: [
    ['Mind Poke', 50, 100],
    ['Psi Storm', 90, 85]
  ],
  Rock: [
    ['Pebble Shot', 50, 95],
    ['Boulder Drop', 85, 85]
  ],
  Steel: [
    ['Iron Tap', 50, 100],
    ['Alloy Smash', 85, 90]
  ],
  Water: [
    ['Splash Jet', 45, 100],
    ['Tidal Crash', 85, 90]
  ]
}

const toMove = (type: PokemonType) => (spec: MoveSpec) => ({
  accuracy: spec[2],
  name: spec[0],
  power: spec[1],
  type
})

// Four moves from the creature's types: both moves of its main type, one of
// its second type (Normal if it has none) and a Normal move. Deterministic,
// so a creature always knows the same moves.
export function movesFor(creature: Pick<Pokemon, 'types'>): Move[] {
  const [main = 'Normal', second] = creature.types.filter(isPokemonType)
  const normal = MOVES_BY_TYPE.Normal.map(toMove('Normal'))
  const chosen: Move[] = MOVES_BY_TYPE[main].slice(0, 2).map(toMove(main))
  if (second && second !== 'Normal') {
    chosen.push(toMove(second)(MOVES_BY_TYPE[second][0]))
  }
  // Top up with Normal moves not already taken (a Normal main type has
  // used the first two).
  for (const move of normal) {
    if (chosen.length === 4) break
    if (!chosen.some(taken => taken.name === move.name)) chosen.push(move)
  }
  return chosen
}
