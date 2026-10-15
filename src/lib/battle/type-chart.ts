import { isPokemonType, type PokemonType } from '../pokemon'

type Matchups = {
  half?: readonly PokemonType[]
  immune?: readonly PokemonType[]
  super?: readonly PokemonType[]
}

// The standard 18-type chart: attacking type → defending types. Anything not
// listed is 1x.
const CHART: Record<PokemonType, Matchups> = {
  Bug: {
    half: ['Fire', 'Fighting', 'Poison', 'Flying', 'Ghost', 'Steel', 'Fairy'],
    super: ['Grass', 'Psychic', 'Dark']
  },
  Dark: {
    half: ['Fighting', 'Dark', 'Fairy'],
    super: ['Psychic', 'Ghost']
  },
  Dragon: { half: ['Steel'], immune: ['Fairy'], super: ['Dragon'] },
  Electric: {
    half: ['Electric', 'Grass', 'Dragon'],
    immune: ['Ground'],
    super: ['Water', 'Flying']
  },
  Fairy: {
    half: ['Fire', 'Poison', 'Steel'],
    super: ['Fighting', 'Dragon', 'Dark']
  },
  Fighting: {
    half: ['Poison', 'Flying', 'Psychic', 'Bug', 'Fairy'],
    immune: ['Ghost'],
    super: ['Normal', 'Ice', 'Rock', 'Dark', 'Steel']
  },
  Fire: {
    half: ['Fire', 'Water', 'Rock', 'Dragon'],
    super: ['Grass', 'Ice', 'Bug', 'Steel']
  },
  Flying: {
    half: ['Electric', 'Rock', 'Steel'],
    super: ['Grass', 'Fighting', 'Bug']
  },
  Ghost: { half: ['Dark'], immune: ['Normal'], super: ['Psychic', 'Ghost'] },
  Grass: {
    half: ['Fire', 'Grass', 'Poison', 'Flying', 'Bug', 'Dragon', 'Steel'],
    super: ['Water', 'Ground', 'Rock']
  },
  Ground: {
    half: ['Grass', 'Bug'],
    immune: ['Flying'],
    super: ['Fire', 'Electric', 'Poison', 'Rock', 'Steel']
  },
  Ice: {
    half: ['Fire', 'Water', 'Ice', 'Steel'],
    super: ['Grass', 'Ground', 'Flying', 'Dragon']
  },
  Normal: { half: ['Rock', 'Steel'], immune: ['Ghost'] },
  Poison: {
    half: ['Poison', 'Ground', 'Rock', 'Ghost'],
    immune: ['Steel'],
    super: ['Grass', 'Fairy']
  },
  Psychic: {
    half: ['Psychic', 'Steel'],
    immune: ['Dark'],
    super: ['Fighting', 'Poison']
  },
  Rock: {
    half: ['Fighting', 'Ground', 'Steel'],
    super: ['Fire', 'Ice', 'Flying', 'Bug']
  },
  Steel: {
    half: ['Fire', 'Water', 'Electric', 'Steel'],
    super: ['Ice', 'Rock', 'Fairy']
  },
  Water: {
    half: ['Water', 'Grass', 'Dragon'],
    super: ['Fire', 'Ground', 'Rock']
  }
}

// Against a dual-type defender the two multipliers stack (0x to 4x). Unknown
// type names count as neutral rather than throwing on odd data.
export function effectiveness(
  attack: PokemonType,
  defenderTypes: readonly string[]
) {
  return defenderTypes
    .filter(isPokemonType)
    .reduce((total, type) => total * typeMultiplier(attack, type), 1)
}

// One attacking type against one defending type: 0, 0.5, 1 or 2.
export function typeMultiplier(attack: PokemonType, defend: PokemonType) {
  const row = CHART[attack]
  if (row.immune?.includes(defend)) return 0
  if (row.half?.includes(defend)) return 0.5
  if (row.super?.includes(defend)) return 2
  return 1
}
