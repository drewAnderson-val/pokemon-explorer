import { memo } from 'react'

import type { Pokemon } from '@/lib/pokemon'

import { cn } from '@/lib/utils'

import { ArtPanel } from './ArtPanel'
import { DialogBox } from './DialogBox'
import { HpBar } from './HpBar'
import { MetaRow } from './MetaRow'
import { StatList } from './StatList'
import { TypeBadge } from './TypeBadge'

type CreatureCardProps = {
  expanded: boolean
  onToggle: (id: number) => void
  pokemon: Pokemon
}

// "Stretched button": the name is the real <button>, and its ::after covers
// the whole card so any click toggles it. Wrapping the card in a <button>
// would put stats and description into the button's accessible name.
export const CreatureCard = memo(function CreatureCard({
  expanded,
  onToggle,
  pokemon
}: CreatureCardProps) {
  const detailsId = `creature-${pokemon.id}-details`
  return (
    <li
      className={cn(
        'group relative flex flex-col gap-3 rounded-box frame-box bg-box p-3.5 has-[button:focus-visible]:focus-ring',
        expanded && 'xs:row-span-2'
      )}
    >
      <ArtPanel
        expanded={expanded}
        legendary={pokemon.isLegendary === true}
        name={pokemon.name}
        number={pokemon.id}
        src={pokemon.imageUrl}
        type={pokemon.types[0] ?? 'Normal'}
      />
      <h2 className="flex items-start gap-1 text-card-title font-bold uppercase">
        <span
          aria-hidden
          className="invisible group-hover:visible group-has-[button:focus-visible]:visible"
        >
          ▶
        </span>
        <button
          aria-controls={detailsId}
          aria-expanded={expanded}
          className="line-clamp-2 text-left uppercase outline-none after:absolute after:inset-0 after:rounded-box after:content-['']"
          onClick={() => onToggle(pokemon.id)}
          type="button"
        >
          {pokemon.name}
        </button>
      </h2>
      <div className="flex flex-wrap gap-1.5">
        {pokemon.types.map(type => (
          <TypeBadge key={type} type={type} />
        ))}
      </div>
      <HpBar hp={pokemon.hp} />
      <div
        className="flex animate-reveal flex-col gap-3"
        hidden={!expanded}
        id={detailsId}
      >
        {expanded && (
          <>
            <StatList pokemon={pokemon} />
            <MetaRow
              generation={pokemon.generation}
              height={pokemon.height}
              weight={pokemon.weight}
            />
            <DialogBox tone="dark">
              <p className="text-body">{pokemon.description}</p>
            </DialogBox>
          </>
        )}
      </div>
    </li>
  )
})

export function CreatureCardSkeleton() {
  return (
    <li
      aria-hidden
      className="flex flex-col gap-3 rounded-box frame-box bg-box p-3.5"
      data-skeleton
    >
      <span className="block h-[140px] animate-pulse-soft rounded-inset bg-inset" />
      <span className="block h-6 w-2/3 animate-pulse-soft rounded-tag bg-inset" />
      <span className="block h-6 w-1/3 animate-pulse-soft rounded-tag bg-inset" />
      <span className="block h-4 animate-pulse-soft rounded-tag bg-inset" />
    </li>
  )
}
