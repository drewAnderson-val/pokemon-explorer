import type { Pokemon } from '@/lib/pokemon'

import { useTeam } from '@/hooks/useTeam'
import { formatNumber } from '@/lib/format'
import {
  addMember,
  hasCreature,
  isTeamFull,
  makeUid,
  newMember
} from '@/lib/team/team'
import { typeStyle } from '@/lib/type-colors'
import { cn } from '@/lib/utils'

import { DialogBox } from './DialogBox'
import { HpBar } from './HpBar'
import { MetaRow } from './MetaRow'
import { StatList } from './StatList'
import { TypeBadge } from './TypeBadge'
import { Button, buttonClass } from './ui/button'

// A creature from the lab: always expanded, and unlike the catalog's
// placeholder photos the image really is the creature, so it gets alt text.
export function CreationCard({
  className,
  creature,
  onDelete
}: {
  className?: string
  creature: Pokemon
  onDelete: (id: number) => void
}) {
  const [team, updateTeam] = useTeam()
  const onTeam = hasCreature(team, creature.id)
  const teamFull = isTeamFull(team)
  // Vertex returns JPEG today; take the extension from the data URL anyway.
  const extension = /^data:image\/(\w+)/.exec(creature.imageUrl)?.[1] ?? 'png'
  const fileName = `${creature.name.replace(/[^\w-]+/g, '-').toLowerCase()}.${extension === 'jpeg' ? 'jpg' : extension}`
  return (
    // Side by side once the card is ≥ 36rem wide (container query, not the
    // viewport): a ~320px image beside ~400px of details keeps the whole card
    // under ~430px tall, so it fits next to the form on a laptop screen.
    <article
      className={cn('@container rounded-box frame-box bg-box p-3.5', className)}
    >
      <div className="grid gap-3 @xl:grid-cols-2 @xl:gap-4">
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
        <div className="flex flex-col gap-3">
          <h2 className="text-card-title font-bold uppercase">
            {creature.name}
          </h2>
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
          <div className="grid grid-cols-2 gap-2">
            {/* Same actions as a catalog card: custom ids resolve from this
                browser's store wherever the battle looks a creature up. */}
            <a
              aria-label={`Battle with ${creature.name}`}
              className={buttonClass()}
              href={`/battle?id=${creature.id}`}
            >
              ▶ Battle
            </a>
            <Button
              aria-label={
                onTeam
                  ? 'On your team'
                  : teamFull
                    ? 'Team full'
                    : `Add ${creature.name} to team`
              }
              disabled={onTeam || teamFull}
              onClick={() =>
                updateTeam(current =>
                  addMember(current, newMember(creature, makeUid()))
                )
              }
              variant="secondary"
            >
              {onTeam ? 'On your team' : teamFull ? 'Team full' : '+ Team'}
            </Button>
            <a
              className={buttonClass('secondary')}
              download={fileName}
              href={creature.imageUrl}
            >
              Download
            </a>
            <Button
              aria-label={`Delete ${creature.name}`}
              onClick={() => onDelete(creature.id)}
              variant="secondary"
            >
              Delete
            </Button>
          </div>
        </div>
      </div>
    </article>
  )
}
