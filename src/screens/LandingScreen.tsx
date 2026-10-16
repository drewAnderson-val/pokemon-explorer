import { LandingScene } from '@/components/LandingScene'

// A game-style title screen: wordmark, a three-item menu, "Press start".
export function LandingScreen() {
  return (
    <main className="relative isolate flex min-h-svh flex-col items-center justify-center overflow-hidden px-5 pt-12 pb-60">
      <LandingScene />

      <div className="relative flex w-full max-w-[640px] flex-col items-center gap-6 text-center">
        <p className="rounded-[6px] bg-title-outline px-3.5 py-1.5 text-label font-bold text-white uppercase">
          A pocket creature adventure
        </p>
        <h1 className="animate-drop text-display font-bold text-white uppercase title-outline">
          Explorer
        </h1>

        <nav
          aria-label="Title menu"
          className="title-menu flex w-full max-w-[360px] animate-pop flex-col gap-1 rounded-box frame-box bg-box p-3 text-left [animation-delay:800ms]"
        >
          <a className="title-menu-item" href="/explore">
            Start exploring
          </a>
          <a className="title-menu-item" href="/battle">
            Battle
          </a>
          <a className="title-menu-item" href="/create">
            Creature Lab
          </a>
        </nav>

        <p
          aria-hidden
          className="animate-blink text-caption font-bold text-white uppercase sky-shadow"
        >
          Press start
        </p>
      </div>

      {/* On a pill: white text straight on the hills is ~3:1, under 4.5:1. */}
      <p className="absolute inset-x-0 bottom-2.5 mx-auto w-fit max-w-[calc(100%-2rem)] rounded-tag bg-title-outline/85 px-2 text-center text-caption text-white">
        Fan-made. All creatures and art are original.
      </p>
    </main>
  )
}
