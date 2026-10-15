export type Point = { x: number; y: number }

export function radarPoints(
  values: readonly number[],
  { max, radius }: { max: number; radius: number }
): Point[] {
  return values.map((value, index) => {
    const fraction = Math.min(Math.max(value / max, 0), 1)
    return polar(index, values.length, fraction * radius)
  })
}

export function ringPoints(
  count: number,
  { fraction, radius }: { fraction: number; radius: number }
): Point[] {
  return Array.from({ length: count }, (_, index) =>
    polar(index, count, fraction * radius)
  )
}

// Axis i of n sits at θᵢ = −π/2 + 2πi/n: the first axis points straight up and
// the rest follow clockwise (SVG's y axis points down). Points are relative to
// the centre, so callers translate once instead of offsetting every vertex.
function polar(index: number, count: number, distance: number): Point {
  const angle = -Math.PI / 2 + (2 * Math.PI * index) / count
  return { x: distance * Math.cos(angle), y: distance * Math.sin(angle) }
}

export const toPath = (points: readonly Point[]) =>
  points.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
