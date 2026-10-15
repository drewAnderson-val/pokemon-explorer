import type { Rng } from './engine'

import { type Pokemon, totalStats } from '../pokemon'

const WEAKEST = 300
const STRONGEST = 1070
const EASIEST = 255
const HARDEST = 30
const MIN_RATE = 3

// Gen III+: a = (3·max − 2·hp) · rate / (3·max), caught with chance a / 255.
export function captureChance(rate: number, hp: number, maxHp: number) {
  return Math.min(1, ((3 * maxHp - 2 * hp) * rate) / (3 * maxHp) / 255)
}

// The data has no per-species catch rate, so stronger creatures are harder to
// catch, loosely like the games (255 for the commonest, 3 for legendaries).
export function catchRate(creature: Pokemon) {
  const total = Math.min(STRONGEST, Math.max(WEAKEST, totalStats(creature)))
  const rate =
    EASIEST - ((total - WEAKEST) * (EASIEST - HARDEST)) / (STRONGEST - WEAKEST)
  return Math.max(MIN_RATE, Math.floor(creature.isLegendary ? rate / 2 : rate))
}

// Four shake checks that all pass with chance `chance`. Returns how many
// passed (4 = caught); the count drives "The ball shook…" messages.
export function shakeChecks(chance: number, rng: Rng) {
  const perShake = chance ** 0.25
  let passed = 0
  while (passed < 4 && rng() < perShake) passed++
  return passed
}
