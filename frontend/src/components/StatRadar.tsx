import type { Pokemon } from '@/lib/pokemon'

import { radarPoints, ringPoints, toPath } from '@/lib/radar'

// Classic handheld order: HP at the top, then clockwise.
const AXES = [
  ['HP', 'hp'],
  ['ATK', 'attack'],
  ['DEF', 'defense'],
  ['SPD', 'speed'],
  ['SP.D', 'specialDefense'],
  ['SP.A', 'specialAttack']
] as const

// One fixed scale for every card (the highest stat in the data is 255), so
// shapes are comparable at a glance. A per-card max would make every
// creature look equally strong.
const STAT_MAX = 255
const RADIUS = 80
const RINGS = [0.25, 0.5, 0.75, 1]
const LABEL_OFFSET = 16

// Decorative: the StatList right below it carries the same numbers as text.
export function StatRadar({ pokemon }: { pokemon: Pokemon }) {
  const shape = radarPoints(
    AXES.map(([, key]) => pokemon[key]),
    { max: STAT_MAX, radius: RADIUS }
  )
  const rim = ringPoints(AXES.length, { fraction: 1, radius: RADIUS })
  const labels = ringPoints(AXES.length, {
    fraction: 1,
    radius: RADIUS + LABEL_OFFSET
  })

  return (
    <svg
      aria-hidden
      className="mx-auto block w-full max-w-[240px] overflow-visible"
      data-radar
      viewBox="-112 -104 224 208"
    >
      {RINGS.map(fraction => (
        <polygon
          className="fill-none stroke-rule"
          key={fraction}
          points={toPath(ringPoints(AXES.length, { fraction, radius: RADIUS }))}
          strokeDasharray={fraction === 1 ? undefined : '2 3'}
          strokeWidth={fraction === 1 ? 2 : 1}
        />
      ))}
      {rim.map((p, index) => (
        <line
          className="stroke-rule"
          key={AXES[index][1]}
          strokeDasharray="2 3"
          x1={0}
          x2={p.x}
          y1={0}
          y2={p.y}
        />
      ))}
      <g className="origin-[0_0] animate-radar">
        <polygon
          className="fill-(--type)/60 stroke-ink"
          data-radar-shape
          points={toPath(shape)}
          strokeLinejoin="round"
          strokeWidth={2}
        />
        {shape.map((p, index) => (
          <rect
            className="fill-ink"
            height={6}
            key={AXES[index][1]}
            shapeRendering="crispEdges"
            width={6}
            x={p.x - 3}
            y={p.y - 3}
          />
        ))}
      </g>
      {labels.map((p, index) => (
        <text
          className="fill-ink-muted text-[11px] font-bold"
          dominantBaseline="middle"
          key={AXES[index][1]}
          textAnchor={Math.abs(p.x) < 1 ? 'middle' : p.x > 0 ? 'start' : 'end'}
          x={p.x}
          y={p.y}
        >
          {AXES[index][0]}
        </text>
      ))}
    </svg>
  )
}
