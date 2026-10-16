import type { CSSProperties } from 'react'

// The battle scene's sky still uses this cloud.
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

// A soft cloud: a flat base with two puffs, scaled from a 240px original.
const CLOUDS = [
  { delay: '-30s', duration: '95s', opacity: 1, scale: 1, top: 110 },
  { delay: '-90s', duration: '130s', opacity: 0.85, scale: 1.25, top: 240 },
  { delay: '-50s', duration: '160s', opacity: 0.7, scale: 0.75, top: 420 }
]

// Decorative only: hidden from assistive tech. The hero sits on top of it.
export function LandingScene() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-[linear-gradient(180deg,var(--color-sky-top)_0%,var(--color-sky-2)_40%,var(--color-sky-3)_72%,var(--color-sky-horizon)_100%)]"
    >
      {CLOUDS.map(cloud => (
        <div
          className="absolute left-0 animate-drift"
          key={cloud.top}
          style={
            {
              '--drift-duration': cloud.duration,
              animationDelay: cloud.delay,
              opacity: cloud.opacity,
              top: cloud.top
            } as CSSProperties
          }
        >
          <div
            className="relative h-[74px] w-60 origin-left"
            style={{ scale: cloud.scale }}
          >
            <span className="absolute bottom-0 left-0 h-10 w-60 rounded-[40px] bg-white" />
            <span className="absolute bottom-3.5 left-11 h-15 w-24 rounded-[50%] bg-white" />
            <span className="absolute bottom-2.5 left-29 h-12.5 w-21 rounded-[50%] bg-white" />
          </div>
        </div>
      ))}
      <svg
        className="absolute inset-x-0 bottom-0 h-[300px] w-full"
        preserveAspectRatio="none"
        viewBox="0 0 1440 300"
      >
        <path
          className="fill-hill-far"
          d="M0 110C200 70 340 96 500 104S800 66 980 92 1280 70 1440 96V300H0Z"
        />
        <path
          className="fill-hill-1"
          d="M0 160C220 120 400 150 580 142S920 112 1120 138 1340 132 1440 124V300H0Z"
        />
        <path
          className="fill-hill-2"
          d="M0 212C260 184 520 208 760 198S1180 178 1440 202V300H0Z"
        />
        <path
          className="fill-hill-3"
          d="M0 258C300 244 640 258 900 252S1260 240 1440 254V300H0Z"
        />
      </svg>
      <Tree className="bottom-24 left-[3%] max-sm:hidden" />
      <Tree className="right-[4%] bottom-28 scale-125 max-sm:hidden" />
    </div>
  )
}

function Tree({ className }: { className: string }) {
  return (
    <div className={`absolute h-40 w-[130px] origin-bottom ${className}`}>
      <span className="absolute bottom-0 left-14 h-16 w-4 bg-[#6b4a2b]" />
      <span className="absolute bottom-12.5 left-0 h-[94px] w-[130px] rounded-[50%] bg-[#2f8a2b]" />
      <span className="absolute bottom-24 left-5.5 h-15.5 w-[86px] rounded-[50%] bg-[#3fa33a]" />
    </div>
  )
}
