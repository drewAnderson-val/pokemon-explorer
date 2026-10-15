import { type Pokemon, totalStats } from '../pokemon'

export const START_LEVEL = 5
export const MAX_LEVEL = 100

export type Stats = {
  attack: number
  defense: number
  specialAttack: number
  specialDefense: number
  speed: number
}

// The games' stat formulas without IVs, EVs or natures. At level 50 a stat is
// base + 5 and HP is base + 60, so level-50 battles match the old rules.
export const statAt = (base: number, level: number) =>
  Math.floor((2 * base * level) / 100) + 5

export const maxHpAt = (base: number, level: number) =>
  Math.floor((2 * base * level) / 100) + level + 10

export function statsAt(creature: Pokemon, level: number): Stats {
  return {
    attack: statAt(creature.attack, level),
    defense: statAt(creature.defense, level),
    specialAttack: statAt(creature.specialAttack, level),
    specialDefense: statAt(creature.specialDefense, level),
    speed: statAt(creature.speed, level)
  }
}

// Medium-fast growth: level n needs n³ total XP.
export const xpForLevel = (level: number) => level ** 3

export function levelForXp(xp: number) {
  let level = 1
  while (level < MAX_LEVEL && xpForLevel(level + 1) <= xp) level++
  return level
}

// The games scale a species' base XP by the defeated level and divide by 7.
// The data has no base XP, so a quarter of the total base stats stands in.
export function xpGain(defeated: Pokemon, defeatedLevel: number) {
  return Math.floor((Math.floor(totalStats(defeated) / 4) * defeatedLevel) / 7)
}

// 0–1 through the current level, for the XP bar.
export function xpProgress(level: number, xp: number) {
  if (level >= MAX_LEVEL) return 1
  const start = xpForLevel(level)
  const span = xpForLevel(level + 1) - start
  return Math.min(1, Math.max(0, (xp - start) / span))
}
