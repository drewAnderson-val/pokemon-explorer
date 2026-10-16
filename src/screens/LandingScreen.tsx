import type { CSSProperties, ReactNode } from 'react'

import { DialogBox } from '@/components/DialogBox'
import { HpBar } from '@/components/HpBar'
import { LandingScene } from '@/components/LandingScene'
import { TypeBadge } from '@/components/TypeBadge'
import { useCatalogSummary } from '@/hooks/usePokemonPages'
import { formatNumber } from '@/lib/format'
import { MAX_SEARCH_LENGTH, POKEMON_TYPES } from '@/lib/pokemon'
import { typeStyle } from '@/lib/type-colors'
import { cn } from '@/lib/utils'

const TRY_TYPES = ['Fire', 'Dragon', 'Ghost'] as const

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

export function LandingScreen() {
  const summary = useCatalogSummary()
  const total = summary.data?.total.toLocaleString('en-US') ?? '…'

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
            {[
              ['Features', '#features'],
              ['Types', '#types'],
              ['Battle', '/battle'],
              ['Create', '/create']
            ].map(([label, href]) => (
              <li key={href}>
                <a
                  className={cn('inline-block px-3.5 py-3', onSky)}
                  href={href}
                >
                  {label}
                </a>
              </li>
            ))}
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
            <p className="max-w-[480px] text-[22px] leading-[1.35] text-white [text-shadow:2px_2px_0_var(--color-title-outline)]">
              Every creature, every type, every stat. Search the full file and
              open any card for the details.
            </p>
            <HeroSearch />
            <p
              aria-hidden
              className="animate-blink text-[18px] font-bold tracking-[0.12em] text-white uppercase [text-shadow:2px_2px_0_var(--color-title-outline)]"
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

      <main className="flex flex-col">
        <section
          aria-label="At a glance"
          className="relative z-3 mx-auto -mt-16 w-full max-w-[1200px] px-6"
        >
          <dl className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
            <Stat label="creatures on file" value={total} />
            <Stat label="types to filter by" value={POKEMON_TYPES.length} />
            <Stat
              label="generations"
              value={summary.data?.generations ?? '…'}
            />
          </dl>
        </section>

        <Section eyebrow="Menu" id="features" title="What will you do?">
          <ul className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-5">
            <Feature
              href="/explore"
              preview={
                <span className="flex items-center gap-2 rounded-[6px] border-2 border-ink px-3 py-2.5">
                  <span aria-hidden>▶</span>
                  <span className="flex-1 border-b-2 border-ink">
                    storm<span className="animate-blink">_</span>
                  </span>
                </span>
              }
              title="Search"
            >
              Find any creature by name, type or description. Results update as
              you type.
            </Feature>
            <Feature
              href="/explore#types"
              preview={
                <span className="flex flex-wrap gap-1.5">
                  {(['Fire', 'Water', 'Dragon'] as const).map(type => (
                    <TypeBadge key={type} type={type} />
                  ))}
                </span>
              }
              title="Filter"
            >
              Narrow the list to any of 18 types, then sort by number, strength
              or speed.
            </Feature>
            <Feature
              href="/explore"
              preview={
                <span className="flex flex-col text-body">
                  <StatLine label="Attack" value={135} />
                  <StatLine label="Speed" value={105} />
                  <span className="mt-0.5 flex justify-between border-t-2 border-ink pt-1 font-bold">
                    TOTAL <span>620</span>
                  </span>
                </span>
              }
              title="Compare"
            >
              Open a card to see all six base stats, the total, and its
              generation, height and weight.
            </Feature>
            <Feature
              href="/battle"
              preview={
                <span className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-[6px] border-2 border-ink px-3 py-2 text-label font-bold uppercase">
                  <span>▶ Fight</span>
                  <span>Team</span>
                  <span>Catch</span>
                  <span>Run</span>
                </span>
              }
              title="Battle"
            >
              Take a team of up to six into battle, catch wild creatures and
              level them up.
            </Feature>
            <Feature
              href="/create"
              preview={
                <span className="flex h-12 items-center justify-center rounded-[6px] border-2 border-ink bg-ink">
                  <span className="flex size-9 items-center justify-center rounded-full border-[3px] border-ink bg-accent text-[22px] font-bold">
                    ?
                  </span>
                </span>
              }
              title="Create"
            >
              Name a creature, pick its types, and the Creature Lab draws it as
              a card you can battle with.
            </Feature>
          </ul>
        </Section>

        <Section
          action={
            <a
              className="text-[17px] font-bold focus-visible:focus-ring"
              href="/explore"
            >
              See all creatures ▶
            </a>
          }
          eyebrow="18 types"
          id="types"
          title="Pick a type to start"
        >
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
            {POKEMON_TYPES.map(type => (
              <li key={type}>
                <a
                  // Read as "Fire, 71 creatures", not the run-together "Fire71".
                  aria-label={
                    summary.data
                      ? `${type}, ${summary.data.types[type]} creatures`
                      : undefined
                  }
                  className="group flex h-16 items-center gap-2.5 rounded-[8px] border-[3px] border-ink bg-(--type) px-3.5 text-[18px] font-bold tracking-[0.05em] text-(--type-text) uppercase shadow-[0_4px_0_var(--color-ink)] transition-transform duration-100 ease-[steps(2)] hover:-translate-y-0.5 focus-visible:focus-ring"
                  href={`/explore?type=${type}`}
                  style={typeStyle(type)}
                >
                  <span
                    aria-hidden
                    className="invisible text-[14px] group-hover:visible group-focus-visible:visible"
                  >
                    ▶
                  </span>
                  {type}
                  {summary.data && (
                    <span className="ml-auto text-[14px] font-normal opacity-90">
                      {summary.data.types[type]}
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </Section>

        <section className="mx-auto w-full max-w-[1200px] px-6 pt-24">
          <div className="relative flex flex-wrap items-center justify-between gap-8 rounded-box border-[6px] border-double border-white bg-ink p-10 text-white outline-[3px] outline-ink">
            <div className="flex max-w-[620px] flex-col gap-2.5">
              <h2 className="text-[40px] leading-[1.05] font-bold">
                Ready, trainer?
              </h2>
              <p className="text-body-lg text-[#e6e6e6]">
                {total} creatures are waiting. Scroll forever, filter by type,
                open any card.
              </p>
            </div>
            <div className="flex items-center gap-4.5">
              <span
                aria-hidden
                className="animate-blink text-body-lg font-bold tracking-[0.12em] text-accent uppercase"
              >
                Press start
              </span>
              <PlayLink className="size-[104px] border-[6px] border-white shadow-[0_7px_0_#000]" />
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-[1200px] flex-wrap justify-between gap-4 px-6 pt-16 pb-12 text-caption text-ink-muted">
        <span className="flex items-center gap-2 font-bold text-ink uppercase">
          <span
            aria-hidden
            className="size-4 rounded-[3px] border-[3px] border-ink bg-accent"
          />
          Explorer
        </span>
        <span>
          Fan-made explorer for a take-home project. Pokémon is a trademark of
          its respective owners.
        </span>
      </footer>
    </div>
  )
}

function Feature({
  children,
  href,
  preview,
  title
}: {
  children: ReactNode
  href: string
  preview: ReactNode
  title: string
}) {
  return (
    <li>
      <a
        className="group flex h-full flex-col gap-3.5 rounded-box frame-box bg-box p-5 focus-visible:focus-ring"
        href={href}
      >
        <h3 className="flex items-center gap-2 text-[22px] font-bold uppercase">
          <span
            aria-hidden
            className="invisible text-body group-hover:visible group-focus-visible:visible"
          >
            ▶
          </span>
          {title}
        </h3>
        <p className="text-body text-ink-muted">{children}</p>
        <span aria-hidden className="mt-auto">
          {preview}
        </span>
      </a>
    </li>
  )
}

// A plain GET form: /explore?search=… opens the explorer pre-searched, and it
// works before (or without) JavaScript.
function HeroSearch() {
  return (
    <DialogBox className="flex max-w-[560px] flex-col gap-2.5 sm:py-3.5 sm:pr-3.5 sm:pl-5.5">
      <form action="/explore" className="contents" method="get">
        <label className="text-[18px]" htmlFor="hero-search">
          What will you look for?
        </label>
        <div className="flex items-center gap-3">
          <span aria-hidden className="text-[18px]">
            ▶
          </span>
          <input
            autoComplete="off"
            className="h-10 w-full min-w-0 border-b-2 border-ink bg-transparent text-[20px] outline-none placeholder:text-ink-muted focus-visible:focus-ring"
            id="hero-search"
            maxLength={MAX_SEARCH_LENGTH}
            name="search"
            placeholder="Name, type, or description"
            type="search"
          />
          <button
            aria-label="Start exploring"
            className="flex size-[72px] flex-none animate-bob items-center justify-center rounded-full border-[5px] border-ink bg-accent shadow-[0_6px_0_var(--color-ink)] transition-transform duration-120 ease-[steps(2)] hover:scale-106 focus-visible:focus-ring active:scale-96"
            type="submit"
          >
            <PlayIcon className="ml-1 size-7" />
          </button>
        </div>
      </form>
      <div className="flex flex-wrap items-center gap-2 text-caption text-ink-muted">
        <span>Try</span>
        {TRY_TYPES.map(type => (
          <a
            className="inline-flex h-8 items-center gap-1.5 rounded-[4px] border-2 border-ink bg-box px-2.5 text-[14px] font-bold tracking-[0.04em] text-ink uppercase hover:bg-inset focus-visible:focus-ring"
            href={`/explore?type=${type}`}
            key={type}
            style={typeStyle(type)}
          >
            <span
              aria-hidden
              className="size-2.5 border-2 border-ink bg-(--type)"
            />
            {type}
          </a>
        ))}
      </div>
    </DialogBox>
  )
}

function PlayIcon({ className }: { className: string }) {
  return (
    <svg aria-hidden className={cn('fill-ink', className)} viewBox="0 0 24 24">
      <path d="M6 3 21 12 6 21Z" />
    </svg>
  )
}

function PlayLink({ className }: { className: string }) {
  return (
    <a
      aria-label="Start exploring"
      className={cn(
        'flex flex-none items-center justify-center rounded-full bg-accent transition-transform duration-120 ease-[steps(2)] hover:scale-106 focus-visible:focus-ring-sky active:scale-96',
        className
      )}
      href="/explore"
    >
      <PlayIcon className="ml-1.5 size-10" />
    </a>
  )
}

function Section({
  action,
  children,
  eyebrow,
  id,
  title
}: {
  action?: ReactNode
  children: ReactNode
  eyebrow: string
  id: string
  title: string
}) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="mx-auto flex w-full max-w-[1200px] scroll-mt-6 flex-col gap-7 px-6 pt-24"
      id={id}
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-label font-bold tracking-[0.1em] text-ink-muted uppercase">
            {eyebrow}
          </p>
          <h2
            className="text-[40px] leading-[1.05] font-bold"
            id={`${id}-title`}
          >
            {title}
          </h2>
        </div>
        {action}
      </div>
      {children}
    </section>
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

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-row-reverse items-baseline justify-end gap-3.5 rounded-box frame-box bg-box px-5.5 py-4.5">
      <dt className="text-[18px] text-ink-muted">{label}</dt>
      <dd className="text-[44px] leading-none font-bold">{value}</dd>
    </div>
  )
}

function StatLine({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex items-baseline gap-1.5 uppercase">
      {label}
      <span className="flex-1 -translate-y-1 border-b-2 border-dotted border-rule" />
      <b>{value}</b>
    </span>
  )
}
