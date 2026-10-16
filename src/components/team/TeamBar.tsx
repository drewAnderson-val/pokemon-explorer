import { DialogBox } from '@/components/DialogBox'
import { HpBar } from '@/components/HpBar'
import { Button, buttonClass } from '@/components/ui/button'
import { useTeam } from '@/hooks/useTeam'
import { useTeamCreatures } from '@/hooks/useTeamCreatures'
import { MAX_TEAM } from '@/lib/battle/engine'
import { memberHp, memberMaxHp, removeMember, restAll } from '@/lib/team/team'

// The creatures travelling with you: level and HP for each, REST to heal
// everyone, × to let one go, and a way into battle.
export function TeamBar({ onNotice }: { onNotice: (text: string) => void }) {
  const [team, setTeam] = useTeam()
  const { creatures, missing } = useTeamCreatures(team)
  const hurt = team.some(member => member.hp !== null)

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
            <a className={buttonClass()} href="/battle">
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
          {team.map(member => {
            const creature = creatures.get(member.creatureId)
            const name =
              creature?.name ??
              (missing.has(member.creatureId) ? 'Missing creature' : '…')
            return (
              <li
                className="flex items-center gap-2 rounded-inset frame-inset bg-inset p-2"
                key={member.uid}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="flex items-baseline justify-between gap-2 text-label font-bold uppercase">
                    <span className="truncate">{name}</span>
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
                <button
                  aria-label={`Remove ${name} from team`}
                  className="size-9 shrink-0 rounded-tag text-label font-bold hover:bg-box focus-visible:focus-ring"
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
