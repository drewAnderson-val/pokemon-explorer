import type { CSSProperties } from 'react'

import { DialogBox } from '@/components/DialogBox'
import { HpBar } from '@/components/HpBar'
import { LandingScene } from '@/components/LandingScene'
import { TypeBadge } from '@/components/TypeBadge'
import { useCatalogSummary } from '@/hooks/usePokemonPages'
import { useTeam } from '@/hooks/useTeam'
import { MAX_TEAM } from '@/lib/battle/engine'
import { formatNumber } from '@/lib/format'
import { POKEMON_TYPES } from '@/lib/pokemon'
import { typeStyle } from '@/lib/type-colors'
import { cn } from '@/lib/utils'

// Decorative sample cards in the hero (hidden from assistive tech): letter
// art like a card whose photo failed, since the catalog's photos aren't the creatures.
const SHOWCASE = [
  {
    className: 'top-[70px] left-0 z-1 rotate-[-7deg]',
    duration: '5s',
    hp: 100,
    id: 6,
    name: 'Aqua Siren',
    types: ['Water']
  },
  {
    className: 'top-0 left-[calc(50%-115px)] z-3',
    duration: '6s',
    hp: 90,
    id: 5,
    name: 'Pyro Drake',
    types: ['Fire', 'Dragon']
  },
  {
    className: 'top-[170px] right-0 z-2 rotate-[6deg]',
    duration: '5.5s',
    hp: 45,
    id: 7,
    name: 'Volt Sprite',
    types: ['Electric']
  }
]

const onSky = 'text-white sky-shadow focus-visible:focus-ring-sky'
const skyText = '[text-shadow:2px_2px_0_var(--color-title-outline)]'

export function LandingScreen() {
  const summary = useCatalogSummary()

  return (
    <div className="flex min-h-svh flex-col">
      <header className="relative isolate overflow-hidden pb-[150px]">
        <LandingScene />

        <nav
          aria-label="Main"
          className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-6 pt-6"
        >
          <a
            className={cn(
              'flex items-center gap-2.5 text-[22px] font-bold tracking-[0.06em] uppercase',
              onSky
            )}
            href="/"
          >
            <span
              aria-hidden
              className="size-[22px] rounded-[4px] border-[3px] border-ink bg-accent"
            />
            Explorer
          </a>
          <ul className="flex flex-wrap items-center gap-1 text-[17px]">
            <li>
              <a
                className={cn('inline-block px-3.5 py-3', onSky)}
                href="/battle"
              >
                Battle
              </a>
            </li>
            <li>
              <a
                className={cn('inline-block px-3.5 py-3', onSky)}
                href="/create"
              >
                Create
              </a>
            </li>
            <li className="ml-2">
              <a
                className="inline-flex h-11 items-center rounded-[4px] border-2 border-ink bg-box px-4 text-label font-bold uppercase hover:bg-inset focus-visible:focus-ring-sky"
                href="/explore"
              >
                Open explorer
              </a>
            </li>
          </ul>
        </nav>

        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-12 px-6 pt-16">
          <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-5.5">
            <p className="self-start rounded-[6px] bg-ink px-3 py-1.5 text-label font-bold tracking-[0.08em] text-accent uppercase">
              Finny · Pokemon
            </p>
            <h1 className="text-display font-bold text-white uppercase title-outline">
              Explorer
            </h1>
            <p
              className={cn(
                'max-w-[480px] text-[22px] leading-[1.35] text-white',
                skyText
              )}
            >
              Every creature, every type, every stat. Battle wild creatures,
              draw your own, or pick up where your team left off.
            </p>
            <StartMenu />
            <p
              aria-hidden
              className={cn(
                'animate-blink text-[18px] font-bold tracking-[0.12em] text-white uppercase',
                skyText
              )}
            >
              Press start
            </p>
          </div>

          <div
            aria-hidden
            className="relative h-[470px] min-w-[300px] flex-[1_1_400px] max-sm:hidden"
          >
            {SHOWCASE.map(card => (
              <ShowcaseCard key={card.id} {...card} />
            ))}
          </div>
        </div>
      </header>

      <main className="relative z-3 mx-auto -mt-16 w-full max-w-[1200px] px-6">
        <section aria-label="At a glance">
          <dl className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
            <Stat
              label="creatures on file"
              value={summary.data?.total.toLocaleString('en-US') ?? '…'}
            />
            <Stat label="types to filter by" value={POKEMON_TYPES.length} />
            <Stat
              label="generations"
              value={summary.data?.generations ?? '…'}
            />
          </dl>
        </section>
      </main>

      <footer className="mx-auto w-full max-w-[1200px] px-6 pt-10 pb-12 text-caption text-ink-muted">
        Fan-made explorer for a take-home project. Pokémon is a trademark of its
        respective owners.
      </footer>
    </div>
  )
}

function ShowcaseCard({
  className,
  duration,
  hp,
  id,
  name,
  types
}: (typeof SHOWCASE)[number]) {
  return (
    <div
      className={cn(
        'absolute flex w-[230px] animate-float flex-col gap-2.5 rounded-box frame-box bg-box p-3',
        className
      )}
      style={
        {
          '--float-duration': duration,
          ...typeStyle(types[0] ?? 'Normal')
        } as CSSProperties
      }
    >
      <div className="relative flex h-[120px] items-end justify-center overflow-hidden rounded-[6px] border-2 border-ink bg-inset">
        <span className="absolute bottom-3 h-5 w-[110px] rounded-[50%] bg-(--type)/33" />
        <span className="relative mb-4 text-[70px] leading-none font-bold text-(--type) [text-shadow:3px_3px_0_var(--color-ink)]">
          {name.charAt(0)}
        </span>
        <span className="absolute top-1.5 left-2 text-caption">
          {formatNumber(id)}
        </span>
      </div>
      <span className="text-[17px] font-bold uppercase">{name}</span>
      <span className="flex flex-wrap gap-1.5">
        {types.map(type => (
          <TypeBadge key={type} type={type} />
        ))}
      </span>
      <HpBar hp={hp} />
    </div>
  )
}

// The hero's three ways in, as a game menu: the ▶ cursor marks the option
// you're pointing at or tabbed to.
function StartMenu() {
  const [team] = useTeam()
  const roster =
    team.length > 0
      ? `${team.length}/${MAX_TEAM} creatures on your team.`
      : 'No team yet: add creatures from the explorer.'

  return (
    <DialogBox className="max-w-[560px] sm:p-3">
      <nav aria-label="Start">
        <ul className="flex flex-col gap-1">
          <StartOption
            description="Send your team against a wild creature."
            href="/battle"
            title="Go into battle"
          />
          <StartOption
            description="Describe a creature and the lab draws its card."
            href="/create"
            title="Creature Lab"
          />
          <StartOption
            description={roster}
            href="/explore#team"
            title="Load your roster"
          />
        </ul>
      </nav>
    </DialogBox>
  )
}

function StartOption({
  description,
  href,
  title
}: {
  description: string
  href: string
  title: string
}) {
  return (
    <li>
      <a
        className="group flex items-center gap-3 rounded-[6px] px-3 py-2.5 hover:bg-inset focus-visible:bg-inset focus-visible:focus-ring"
        href={href}
      >
        <span
          aria-hidden
          className="invisible animate-blink text-body-lg group-hover:visible group-focus-visible:visible"
        >
          ▶
        </span>
        <span className="flex flex-col">
          <span className="text-[22px] font-bold tracking-[0.04em] uppercase">
            {title}
          </span>
          <span className="text-body text-ink-muted">{description}</span>
        </span>
      </a>
    </li>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-row-reverse items-baseline justify-end gap-3.5 rounded-box frame-box bg-box px-5.5 py-4.5">
      <dt className="text-[18px] text-ink-muted">{label}</dt>
      <dd className="text-[44px] leading-none font-bold">{value}</dd>
    </div>
  )
}
