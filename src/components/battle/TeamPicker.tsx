import { type KeyboardEvent, useEffect, useRef, useState } from 'react'

import { CreatureArt } from '@/components/CreatureArt'
import { TypeBadge } from '@/components/TypeBadge'
import { useCreations } from '@/hooks/useCreations'
import { usePokemonPages } from '@/hooks/usePokemonPages'
import { useTeamCreatures } from '@/hooks/useTeamCreatures'
import { MAX_TEAM } from '@/lib/battle/engine'
import { type Pokemon, POKEMON_TYPES, type PokemonType } from '@/lib/pokemon'
import { hasCreature, isTeamFull, type TeamMember } from '@/lib/team/team'
import { cn } from '@/lib/utils'

const TABS = ['team', 'all', 'custom', 'type'] as const
type Tab = (typeof TABS)[number]

type TeamPickerProps = {
  onStart: () => void
  onToggle: (creature: Pokemon) => void
  team: TeamMember[]
}

// Choosing the team on the console: a tab bar on top (◀▶ switches), a list
// (▲▼ moves, A adds or removes), START to battle. Shares the explorer's team.
export function TeamPicker({ onStart, onToggle, team }: TeamPickerProps) {
  const [tab, setTab] = useState<Tab>(team.length > 0 ? 'team' : 'all')
  const [type, setType] = useState<PokemonType>(POKEMON_TYPES[0])
  const rootRef = useRef<HTMLDivElement>(null)

  // Keep focus on the screen so the D-pad and A/B reach the picker: on the
  // first item of a new tab, and again when a list loads or a removed row
  // takes the focus with it.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const focusFirst = () =>
      (
        root.querySelector<HTMLButtonElement>('[data-pick]:enabled') ?? root
      ).focus()
    focusFirst()
    const observer = new MutationObserver(() => {
      const active = document.activeElement
      if (active === root || active === document.body) focusFirst()
    })
    observer.observe(root, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [tab])

  const switchTab = (step: number) =>
    setTab(
      current =>
        TABS[(TABS.indexOf(current) + step + TABS.length) % TABS.length]
    )

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      switchTab(event.key === 'ArrowRight' ? 1 : -1)
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      moveFocus(event.currentTarget, event.key === 'ArrowDown' ? 1 : -1)
    }
  }

  const full = isTeamFull(team)
  return (
    <div
      aria-label="Choose your team"
      className="flex h-full min-h-96 flex-col gap-2 outline-none"
      onKeyDown={onKeyDown}
      ref={rootRef}
      role="group"
      tabIndex={-1}
    >
      <div
        aria-label="Lists"
        className="grid grid-cols-4 gap-1 border-b-4 border-ink pb-2"
        role="tablist"
      >
        {TABS.map(name => (
          <button
            aria-selected={tab === name}
            className={cn(
              'rounded-tag px-1 py-1.5 text-label font-bold uppercase',
              tab === name ? 'bg-ink text-white' : 'hover:bg-inset'
            )}
            key={name}
            onClick={() => setTab(name)}
            role="tab"
            tabIndex={-1}
            type="button"
          >
            {name === 'team' ? `Team ${team.length}/${MAX_TEAM}` : name}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" role="tabpanel">
        {tab === 'team' && <TeamList onToggle={onToggle} team={team} />}
        {tab === 'all' && (
          <CatalogList
            full={full}
            onToggle={onToggle}
            team={team}
            type={null}
          />
        )}
        {tab === 'custom' && (
          <CustomList full={full} onToggle={onToggle} team={team} />
        )}
        {tab === 'type' && (
          <>
            <button
              className={rowClass}
              data-pick
              onClick={() =>
                setType(
                  current =>
                    POKEMON_TYPES[
                      (POKEMON_TYPES.indexOf(current) + 1) %
                        POKEMON_TYPES.length
                    ]
                )
              }
              type="button"
            >
              <Cursor />
              <span className="text-label font-bold uppercase">Type</span>
              <TypeBadge type={type} />
              <span className="ml-auto text-label">Next ▸</span>
            </button>
            <CatalogList
              full={full}
              key={type}
              onToggle={onToggle}
              team={team}
              type={type}
            />
          </>
        )}
      </div>

      <div className="flex items-center gap-3 border-t-4 border-ink pt-2">
        <p className="min-w-0 flex-1 text-label text-ink-muted">
          {full
            ? 'Team full. A on a member to remove it.'
            : '◀▶ list · A add/remove · START battle'}
        </p>
        <button
          className={cn(rowClass, 'w-auto')}
          data-pick
          data-start
          disabled={team.length === 0}
          onClick={onStart}
          type="button"
        >
          <Cursor />
          <span className="text-label font-bold uppercase">Start</span>
        </button>
      </div>
    </div>
  )
}

const rowClass =
  'group flex min-h-11 w-full items-center gap-2 rounded-tag px-1 py-1 text-left focus-visible:focus-ring enabled:hover:bg-inset disabled:text-ink-muted'

function CatalogList({
  full,
  onToggle,
  team,
  type
}: {
  full: boolean
  onToggle: (creature: Pokemon) => void
  team: TeamMember[]
  type: null | PokemonType
}) {
  const pages = usePokemonPages({ search: '', sort: 'id', type })
  if (pages.isPending) return <Note>Loading…</Note>
  if (pages.isError) {
    return (
      <button
        className={rowClass}
        data-pick
        onClick={() => void pages.refetch()}
        type="button"
      >
        <Cursor />
        <span className="text-label font-bold text-danger">
          Couldn&apos;t load. Try again
        </span>
      </button>
    )
  }
  const creatures = pages.data.pages.flatMap(page => page.data)
  return (
    <>
      <Rows creatures={creatures} full={full} onToggle={onToggle} team={team} />
      {pages.hasNextPage && (
        <button
          className={rowClass}
          data-pick
          disabled={pages.isFetchingNextPage}
          onClick={() => void pages.fetchNextPage()}
          type="button"
        >
          <Cursor />
          <span className="text-label font-bold uppercase">
            {pages.isFetchingNextPage ? 'Loading…' : 'More ▼'}
          </span>
        </button>
      )}
    </>
  )
}

// The focused item shows ▶, like the battle menus.
function Cursor() {
  return (
    <span
      aria-hidden
      className="invisible text-label font-bold group-hover:visible group-focus:visible"
    >
      ▶
    </span>
  )
}

function CustomList({
  full,
  onToggle,
  team
}: {
  full: boolean
  onToggle: (creature: Pokemon) => void
  team: TeamMember[]
}) {
  const { creations, isPending } = useCreations()
  if (isPending) return <Note>Loading…</Note>
  if (creations.length === 0) {
    return <Note>No custom creatures yet. Make one in the Creature Lab.</Note>
  }
  return (
    <Rows creatures={creations} full={full} onToggle={onToggle} team={team} />
  )
}

// ▲▼ walk the enabled items top to bottom; from the picker itself (nothing
// focused yet, e.g. while a list loads) ▼ lands on the first.
function moveFocus(root: HTMLElement, step: number) {
  const items = Array.from(
    root.querySelectorAll<HTMLButtonElement>('[data-pick]:enabled')
  )
  const index = items.findIndex(item => item === document.activeElement)
  const next = index < 0 ? 0 : index + step
  items[Math.max(0, Math.min(items.length - 1, next))]?.focus()
}

function Note({ children }: { children: string }) {
  return (
    <p className="p-2 text-label text-ink-muted" role="status">
      {children}
    </p>
  )
}

function Rows({
  creatures,
  full,
  onToggle,
  team
}: {
  creatures: Pokemon[]
  full: boolean
  onToggle: (creature: Pokemon) => void
  team: TeamMember[]
}) {
  return (
    <ul>
      {creatures.map(creature => {
        const onTeam = hasCreature(team, creature.id)
        return (
          <li key={creature.id}>
            <button
              aria-pressed={onTeam}
              className={rowClass}
              data-pick
              disabled={full && !onTeam}
              onClick={() => onToggle(creature)}
              type="button"
            >
              <Cursor />
              <span className="relative size-10 shrink-0 overflow-hidden rounded-tag bg-inset">
                <CreatureArt
                  height={80}
                  letterClassName="text-[20px]"
                  name={creature.name}
                  src={creature.imageUrl}
                  type={creature.types[0] ?? 'normal'}
                  width={80}
                />
              </span>
              <span className="min-w-0 flex-1 truncate text-label font-bold uppercase">
                {creature.name}
              </span>
              <span className="flex gap-1 max-xs:hidden">
                {creature.types.map(t => (
                  <TypeBadge key={t} type={t} />
                ))}
              </span>
              <span aria-hidden className="w-4 text-label font-bold">
                {onTeam ? '★' : ''}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function TeamList({
  onToggle,
  team
}: {
  onToggle: (creature: Pokemon) => void
  team: TeamMember[]
}) {
  const { creatures, isPending } = useTeamCreatures(team)
  if (team.length === 0) {
    return <Note>Your team is empty. ▶ to ALL to pick some.</Note>
  }
  if (isPending) return <Note>Loading…</Note>
  const members = team.flatMap(member => {
    const creature = creatures.get(member.creatureId)
    return creature ? [creature] : []
  })
  return (
    <Rows creatures={members} full={false} onToggle={onToggle} team={team} />
  )
}
