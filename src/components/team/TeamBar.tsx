import { useState } from 'react'

import { DialogBox } from '@/components/DialogBox'
import { HpBar } from '@/components/HpBar'
import { Button, buttonClass } from '@/components/ui/button'
import { useTeam } from '@/hooks/useTeam'
import { useTeamCreatures } from '@/hooks/useTeamCreatures'
import { MAX_TEAM } from '@/lib/battle/engine'
import {
  memberHp,
  memberMaxHp,
  moveMember,
  removeMember,
  restAll
} from '@/lib/team/team'
import { cn } from '@/lib/utils'

// The creatures travelling with you: level and HP for each, REST to heal
// everyone, ◀ ▶ to change the order, × to let one go, and a way into battle.
export function TeamBar({ onNotice }: { onNotice: (text: string) => void }) {
  const [team, setTeam] = useTeam()
  const { creatures, missing } = useTeamCreatures(team)
  const hurt = team.some(member => member.hp !== null)
  // Pointing at ▶ Battle marks who goes out first: the battle sends the first
  // member that's on file and not fainted.
  const [pointing, setPointing] = useState(false)
  const lead = team.find(member => {
    const creature = creatures.get(member.creatureId)
    return creature !== undefined && memberHp(member, creature) > 0
  })

  return (
    <DialogBox
      aria-labelledby="team-heading"
      className="flex scroll-mt-6 flex-col gap-3"
      // The landing page's "Load your roster" links here.
      id="team"
      role="region"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-card-title font-bold uppercase" id="team-heading">
          Your team{' '}
          <span className="text-caption font-medium text-ink-muted">
            {team.length}/{MAX_TEAM}
          </span>
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!hurt}
            onClick={() => {
              setTeam(restAll)
              onNotice('Your team is rested!')
            }}
            variant="secondary"
          >
            Rest
          </Button>
          {team.length > 0 && (
            <a
              className={buttonClass()}
              href="/battle"
              onBlur={() => setPointing(false)}
              onFocus={() => setPointing(true)}
              onMouseEnter={() => setPointing(true)}
              onMouseLeave={() => setPointing(false)}
            >
              ▶ Battle
            </a>
          )}
        </div>
      </div>
      {team.length === 0 ? (
        <p className="text-body text-ink-muted">
          No one is travelling with you yet. Open a card and add a creature.
        </p>
      ) : (
        <ul
          aria-label="Team members"
          className="grid gap-2 xs:grid-cols-2 lg:grid-cols-3"
        >
          {team.map((member, index) => {
            const creature = creatures.get(member.creatureId)
            const name =
              creature?.name ??
              (missing.has(member.creatureId) ? 'Missing creature' : '…')
            const first = pointing && member.uid === lead?.uid
            return (
              <li
                className={cn(
                  'flex items-center gap-2 rounded-inset frame-inset bg-inset p-2 transition-colors',
                  first && 'bg-accent focus-ring'
                )}
                key={member.uid}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="flex items-baseline justify-between gap-2 text-label font-bold uppercase">
                    <span className="truncate">{name}</span>
                    {first && (
                      <span className="mr-auto shrink-0 rounded-tag bg-ink px-1.5 text-caption text-accent">
                        Goes first
                      </span>
                    )}
                    <span className="shrink-0 text-caption">
                      Lv{member.level}
                    </span>
                  </p>
                  {creature && (
                    <HpBar
                      hp={memberHp(member, creature)}
                      max={memberMaxHp(member, creature)}
                    />
                  )}
                </div>
                <span className="flex shrink-0">
                  <button
                    aria-label={`Move ${name} earlier`}
                    className={iconButton}
                    disabled={index === 0}
                    onClick={() =>
                      setTeam(current => moveMember(current, member.uid, -1))
                    }
                    type="button"
                  >
                    ◀
                  </button>
                  <button
                    aria-label={`Move ${name} later`}
                    className={iconButton}
                    disabled={index === team.length - 1}
                    onClick={() =>
                      setTeam(current => moveMember(current, member.uid, 1))
                    }
                    type="button"
                  >
                    ▶
                  </button>
                </span>
                <button
                  aria-label={`Remove ${name} from team`}
                  className={iconButton}
                  onClick={() =>
                    setTeam(current => removeMember(current, member.uid))
                  }
                  type="button"
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </DialogBox>
  )
}

const iconButton =
  'size-9 shrink-0 rounded-tag text-label font-bold enabled:hover:bg-box focus-visible:focus-ring disabled:text-ink-muted disabled:opacity-40'
