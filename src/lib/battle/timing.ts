// The timing bar: stop the pointer near the middle for bonus damage. Bonus
// only, so pressing badly (or not at all) is never worse than no bar.
export type TimingGrade = 'nice' | 'ok' | 'perfect'

export const TIMING_PASS_MS = 600
// After this long without a press the turn goes ahead at ×1.
export const TIMING_WINDOW_MS = 2400

const PERFECT_RADIUS = 0.05
const NICE_RADIUS = 0.25

export const TIMING_LABEL: Record<TimingGrade, string> = {
  nice: 'Nice!',
  ok: 'OK',
  perfect: 'Perfect!'
}

// Where the pointer is after `elapsed` ms: a triangle wave, 0 → 1 in one
// pass, then back. Matches the CSS animation (linear, alternate).
export function barPosition(elapsed: number, passMs = TIMING_PASS_MS) {
  const t = (elapsed / passMs) % 2
  return t <= 1 ? t : 2 - t
}

export function timingResult(position: number): {
  bonus: number
  grade: TimingGrade
} {
  const distance = Math.abs(position - 0.5)
  // A hair of tolerance so the zone edges aren't lost to float rounding.
  if (distance <= PERFECT_RADIUS + 1e-9)
    return { bonus: 1.25, grade: 'perfect' }
  if (distance <= NICE_RADIUS + 1e-9) return { bonus: 1.1, grade: 'nice' }
  return { bonus: 1, grade: 'ok' }
}
