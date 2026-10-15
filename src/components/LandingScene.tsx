import type { CSSProperties } from 'react'

import { cn } from '@/lib/utils'

const CLOUDS = [
  { delay: '0s', duration: '40s', top: 70 },
  { delay: '-15s', duration: '52s', top: 170 },
  { delay: '-30s', duration: '46s', top: 110 }
]

// Pixel art: keep edges hard when the GIFs are scaled up.
const sprite = 'absolute [image-rendering:pixelated]'

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

// The title screen's sky, hills and creatures. Decorative only: hidden from
// assistive tech, and the sparkles and side creatures drop out on phones.
export function LandingScene() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-[linear-gradient(180deg,var(--color-sky-top)_0%,#5fa8ec_55%,var(--color-sky-horizon)_100%)]"
    >
      {CLOUDS.map(cloud => (
        <div
          className="title-cloud animate-drift"
          key={cloud.top}
          style={
            {
              '--drift-duration': cloud.duration,
              animationDelay: cloud.delay,
              top: cloud.top
            } as CSSProperties
          }
        />
      ))}
      <img
        alt=""
        className={cn(
          sprite,
          'top-[200px] left-0 size-[84px] animate-fly-left'
        )}
        src="/landing/bat.gif"
      />
      <img
        alt=""
        className={cn(
          sprite,
          'top-[60px] left-[16%] size-[42px] animate-twinkle max-sm:hidden'
        )}
        src="/landing/sparkle.gif"
      />
      <img
        alt=""
        className={cn(
          sprite,
          'top-[120px] right-[14%] size-[54px] animate-twinkle [animation-delay:500ms] max-sm:hidden'
        )}
        src="/landing/sparkle.gif"
      />
      <div className="title-hill -left-[10%] h-[230px] w-[70%] bg-hill-1" />
      <div className="title-hill -right-[12%] h-[190px] w-[66%] bg-hill-2" />
      <div className="title-hill left-[20%] h-[110px] w-[60%] bg-hill-3" />
      <img
        alt=""
        className={cn(
          sprite,
          'bottom-[150px] left-[7%] size-[120px] max-sm:hidden'
        )}
        src="/landing/sprout.gif"
      />
      <img
        alt=""
        className={cn(
          sprite,
          'right-[8%] bottom-[120px] size-[120px] max-sm:hidden'
        )}
        src="/landing/flame.gif"
      />
      <img
        alt=""
        className={cn(sprite, 'bottom-[40px] left-1/2 -ml-[55px] size-[110px]')}
        src="/landing/droplet.gif"
      />
      <img
        alt=""
        className={cn(sprite, '-bottom-2 left-[30%] size-24')}
        src="/landing/grass.gif"
      />
      <img
        alt=""
        className={cn(sprite, 'right-[28%] -bottom-2 size-24')}
        src="/landing/grass.gif"
      />
    </div>
  )
}
