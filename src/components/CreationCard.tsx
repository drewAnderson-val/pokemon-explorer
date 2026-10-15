import type { Pokemon } from '@/lib/pokemon'

import { formatNumber } from '@/lib/format'
import { typeStyle } from '@/lib/type-colors'

import { DialogBox } from './DialogBox'
import { HpBar } from './HpBar'
import { MetaRow } from './MetaRow'
import { StatList } from './StatList'
import { TypeBadge } from './TypeBadge'

// A creature from the lab: always expanded, and unlike the catalog's
// placeholder photos the image really is the creature, so it gets alt text.
export function CreationCard({ creature }: { creature: Pokemon }) {
  const fileName = `${creature.name.replace(/[^\w-]+/g, '-').toLowerCase()}.png`
  return (
    <li className="flex flex-col gap-3 rounded-box frame-box bg-box p-3.5">
      <div
        className="relative aspect-square overflow-hidden rounded-inset frame-inset bg-inset"
        style={typeStyle(creature.types[0] ?? 'Normal')}
      >
        <img
          alt={`Generated artwork of ${creature.name}`}
          className="size-full object-cover"
          src={creature.imageUrl}
        />
        <span className="absolute top-1.5 left-1.5 rounded-tag bg-box/90 px-1.5 text-caption">
          {formatNumber(creature.id)}
        </span>
      </div>
      <h2 className="text-card-title font-bold uppercase">{creature.name}</h2>
      <div className="flex flex-wrap gap-1.5">
        {creature.types.map(type => (
          <TypeBadge key={type} type={type} />
        ))}
      </div>
      <HpBar hp={creature.hp} />
      <StatList pokemon={creature} />
      <MetaRow
        generation={creature.generation}
        height={creature.height}
        weight={creature.weight}
      />
      <DialogBox tone="dark">
        <p className="text-body">{creature.description}</p>
      </DialogBox>
      <a
        className="inline-flex h-11 items-center justify-center rounded-tag frame-tag bg-box px-4 text-label font-bold uppercase hover:bg-inset focus-visible:focus-ring"
        download={fileName}
        href={creature.imageUrl}
      >
        Download image
      </a>
    </li>
  )
}
