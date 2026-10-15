import { DialogBox } from '@/components/DialogBox'
import { LandingScene } from '@/components/LandingScene'
import { PlayButton } from '@/components/PlayButton'
import { useCatalogTotal } from '@/hooks/usePokemonPages'

export function LandingScreen() {
  const total = useCatalogTotal()
  const count = total.data ?? '…'

  return (
    <div className="relative isolate flex min-h-[max(100svh,900px)] flex-col">
      <LandingScene />

      <nav
        aria-label="Main"
        className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-4 px-4 py-6 text-white xs:px-6"
      >
        <a
          aria-label="Pokemon Explorer home"
          className="flex items-center gap-2 text-label font-bold uppercase sky-shadow focus-visible:focus-ring-sky"
          href="/"
        >
          <span
            aria-hidden
            className="size-6 rounded-tag frame-tag bg-accent"
          />
          Explorer
        </a>
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-label font-bold uppercase sky-shadow">
          <li>
            <a className="focus-visible:focus-ring-sky" href="/explore">
              Browse
            </a>
          </li>
          <li>
            <a className="focus-visible:focus-ring-sky" href="/explore#types">
              Types
            </a>
          </li>
          <li>
            <a className="focus-visible:focus-ring-sky" href="#about">
              About
            </a>
          </li>
        </ul>
      </nav>

      <main className="mx-auto flex w-full max-w-[900px] flex-col items-center gap-7 px-4 pt-8 pb-56 text-center">
        <p className="rounded-tag frame-tag bg-box px-2 py-0.5 text-label font-bold uppercase">
          {count} creatures on file
        </p>
        <div>
          <p className="mb-3 text-label font-bold text-white uppercase sky-shadow">
            Finny · Pokemon
          </p>
          <h1 className="text-display font-bold text-white uppercase title-outline">
            Explorer
          </h1>
        </div>
        <DialogBox
          className="w-full max-w-[560px] text-left"
          id="about"
          showMore
        >
          <p className="text-body-lg">
            A wild catalog appeared! Search {count} creatures by name, type or
            description, then open any card to see its stats.
          </p>
        </DialogBox>
        <PlayButton href="/explore" />
      </main>

      <p className="absolute inset-x-0 bottom-4 mx-auto w-fit max-w-[calc(100%-2rem)] rounded-tag bg-box/90 px-2 text-center text-caption">
        Fan-made demo. Creatures are randomly generated; not affiliated with any
        game company.
      </p>
    </div>
  )
}
