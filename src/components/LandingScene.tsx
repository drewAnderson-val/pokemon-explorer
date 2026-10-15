import type { CSSProperties } from 'react'

import { POKEMON_TYPES } from '@/lib/pokemon'

import { TypeBadge } from './TypeBadge'

const CLOUDS = [
  { delay: '-20s', duration: '110s', top: '12%', width: 140 },
  { delay: '-70s', duration: '150s', top: '22%', width: 96 },
  { delay: '-5s', duration: '90s', top: '34%', width: 120 },
  { delay: '-100s', duration: '130s', top: '8%', width: 72 }
]

const TREES = [
  { bottom: 150, left: '8%', scale: 1 },
  { bottom: 110, left: '78%', scale: 1.25 },
  { bottom: 95, left: '88%', scale: 0.9 }
]

export function Cloud() {
  return (
    <svg
      className="w-full"
      fill="white"
      shapeRendering="crispEdges"
      viewBox="0 0 16 6"
    >
      <path d="M4 0h5v1h2v1h3v1h2v3H0V3h1V2h3z" />
    </svg>
  )
}

// Decorative only: hidden from assistive tech.
export function LandingScene() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <div className="absolute inset-0 bg-[linear-gradient(180deg,var(--color-sky-top)_0%,var(--color-sky-2)_38%,var(--color-sky-3)_68%,var(--color-sky-horizon)_100%)]" />
      {CLOUDS.map(cloud => (
        <div
          className="absolute left-0 animate-drift"
          key={cloud.top}
          style={
            {
              '--drift-duration': cloud.duration,
              animationDelay: cloud.delay,
              top: cloud.top,
              width: cloud.width
            } as CSSProperties
          }
        >
          <Cloud />
        </div>
      ))}
      <svg
        className="absolute inset-x-0 bottom-0 h-[360px] w-full"
        preserveAspectRatio="none"
        viewBox="0 0 1440 360"
      >
        <path
          className="fill-hill-far"
          d="M0 170C240 90 420 120 640 150S1080 80 1440 140V360H0Z"
        />
        <path
          className="fill-hill-1"
          d="M0 220C200 160 380 180 560 215S980 150 1440 210V360H0Z"
        />
        <path
          className="fill-hill-2"
          d="M0 270C260 220 520 250 760 280S1180 230 1440 260V360H0Z"
        />
        <path
          className="fill-hill-3"
          d="M0 315C320 285 640 300 900 320S1260 295 1440 310V360H0Z"
        />
      </svg>
      {TREES.map(tree => (
        <div
          className="absolute"
          key={tree.left}
          style={{ bottom: tree.bottom, left: tree.left, scale: tree.scale }}
        >
          <Tree />
        </div>
      ))}
      <div className="absolute inset-x-0 bottom-16 overflow-hidden">
        <div className="flex w-max animate-marquee gap-3">
          {[...POKEMON_TYPES, ...POKEMON_TYPES].map((type, index) => (
            // The list is duplicated for a seamless loop, so names repeat.
            // eslint-disable-next-line @eslint-react/no-array-index-key
            <TypeBadge key={`${type}-${index}`} type={type} />
          ))}
        </div>
      </div>
    </div>
  )
}

function Tree() {
  return (
    <svg className="w-12" shapeRendering="crispEdges" viewBox="0 0 12 16">
      <path
        className="fill-hill-3 stroke-ink"
        d="M4 0h4v2h2v3h2v5h-2v2H2v-2H0V5h2V2h2z"
        strokeWidth="0.6"
      />
      <path className="fill-ink" d="M5 12h2v4H5z" />
    </svg>
  )
}
