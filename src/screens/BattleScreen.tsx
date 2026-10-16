import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import { BattleArena } from '@/components/battle/BattleArena'
import { Handheld } from '@/components/battle/Handheld'
import { DialogBox } from '@/components/DialogBox'
import { Button, buttonClass } from '@/components/ui/button'
import { useFullscreen } from '@/hooks/useFullscreen'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { useSettings } from '@/hooks/useSettings'
import { useTeam } from '@/hooks/useTeam'
import { creatureQuery, useTeamCreatures } from '@/hooks/useTeamCreatures'
import { useWildFighter } from '@/hooks/useWildFighter'
import { createFighter, type Rng } from '@/lib/battle/engine'
import { unlockAudio } from '@/lib/sound'
import {
  hasCreature,
  isTeamFull,
  leadWith,
  makeUid,
  restAll,
  saveBattle
} from '@/lib/team/team'

type BattleScreenProps = {
  // From `?id=N` (the ▶ Battle link): that creature leads this battle.
  playerId: null | number
  rng?: Rng
}

export function BattleScreen({
  playerId,
  rng = Math.random
}: BattleScreenProps) {
  const [settings] = useSettings()
  const stageRef = useRef<HTMLDivElement>(null)
  const fullscreen = useFullscreen(stageRef)
  return (
    // lg: the title and settings sit beside the handheld, which is sized from
    // the window height, so the whole console fits on screen.
    <main className="mx-auto flex max-w-[960px] flex-col gap-4 px-4 pt-6 pb-16 xs:px-6 md:max-w-[1240px] lg:grid lg:grid-cols-[minmax(12rem,1fr)_auto_minmax(0,1fr)] lg:items-start lg:gap-8 lg:py-3">
      <header className="flex flex-wrap items-center justify-between gap-3 lg:flex-col lg:items-start lg:pt-6">
        <h1 className="text-heading font-bold uppercase">Battle</h1>
        <div className="flex flex-wrap items-center gap-3 lg:flex-col lg:items-start">
          <SettingsToggles fullscreen={fullscreen} />
          <a
            className="inline-flex h-11 items-center text-label font-bold uppercase focus-visible:focus-ring"
            href="/explore"
          >
            ◀ Explorer
          </a>
        </div>
      </header>
      <div className="battle-stage" ref={stageRef}>
        {fullscreen.active && (
          <button
            className={buttonClass('secondary', 'fixed top-4 right-4 z-10')}
            onClick={() => void fullscreen.toggle()}
            type="button"
          >
            Exit full screen
          </button>
        )}
        <Handheld classic={settings.classic}>
          <BattleLoader playerId={playerId} rng={rng} />
        </Handheld>
      </div>
    </main>
  )
}

// `/battle?id=N`: N is the player's pick from the explorer.
export function parsePlayerId(search: string) {
  const raw = new URLSearchParams(search).get('id') ?? ''
  return /^\d+$/.test(raw) && Number(raw) >= 1 ? Number(raw) : null
}

function BattleLoader({
  playerId,
  rng
}: {
  playerId: null | number
  rng: Rng
}) {
  const [team, setTeam] = useTeam()
  const [round, setRound] = useState(0)
  const [fullTeamOk, setFullTeamOk] = useState(false)
  const pick = useQuery({
    ...creatureQuery(playerId ?? 0),
    enabled: playerId !== null
  })

  // "▶ Battle with X": X leads, joining the team if there's room. leadWith
  // is a no-op once X is in front, so a double effect can't add it twice.
  useEffect(() => {
    if (!pick.data) return
    const creature = pick.data
    setTeam(current => leadWith(current, creature, makeUid()))
  }, [setTeam, pick.data])

  // A full team without X can't take it: say so rather than quietly battling
  // with someone else. Otherwise wait until X is in front before starting.
  const pickBlocked =
    pick.data !== undefined &&
    isTeamFull(team) &&
    !hasCreature(team, pick.data.id)
  const pickPending =
    playerId !== null &&
    !pick.isError &&
    !pickBlocked &&
    team[0]?.creatureId !== playerId

  const { creatures, isError, isPending, retry } = useTeamCreatures(team)
  // Members whose creature is no longer on file sit this one out.
  const party = team.flatMap(member => {
    const creature = creatures.get(member.creatureId)
    return creature
      ? [
          createFighter(creature, member.level, {
            hp: member.hp,
            uid: member.uid,
            xp: member.xp
          })
        ]
      : []
  })
  const ready =
    team.length > 0 &&
    !isPending &&
    !isError &&
    !pickPending &&
    (!pickBlocked || fullTeamOk)
  const canFight = party.some(fighter => fighter.hp > 0)
  const wild = useWildFighter({
    enabled: ready && canFight,
    excludeIds: team.map(member => member.creatureId),
    levels: party.map(fighter => fighter.level),
    rng,
    round
  })

  // A started battle keeps going even when saving makes the team "tired".
  if (wild.data) {
    return (
      <BattleArena
        enemy={wild.data}
        key={round}
        onBattleAgain={() => setRound(r => r + 1)}
        onSave={state => setTeam(current => saveBattle(current, state))}
        party={party}
        rng={rng}
        teamSize={team.length}
      />
    )
  }
  if (team.length === 0) {
    if (playerId !== null && !pick.isError) return <Searching />
    return <NotFound />
  }
  if (pickBlocked && !fullTeamOk) {
    return (
      <DialogBox className="flex flex-col items-center gap-4 text-center">
        <p className="text-body-lg">
          Your team is full, so {pick.data?.name} can't join. Make room in the
          explorer&apos;s team bar, or battle with your team.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={() => setFullTeamOk(true)}>
            Battle with my team
          </Button>
          <a className={buttonClass('secondary')} href="/explore">
            Back to explorer
          </a>
        </div>
      </DialogBox>
    )
  }
  if (isError || wild.isError) {
    return (
      <DialogBox className="text-center" role="alert">
        <p className="text-body-lg font-bold text-danger">
          The connection fled! Try again.
        </p>
        <Button
          className="mt-4"
          onClick={() => {
            retry()
            if (wild.isError) void wild.refetch()
          }}
          variant="secondary"
        >
          Try again
        </Button>
      </DialogBox>
    )
  }
  if (ready && party.length === 0) {
    return (
      <DialogBox className="flex flex-col items-center gap-4 text-center">
        <p className="text-body-lg">
          Your team's creatures are no longer on file. Add new ones in the
          explorer.
        </p>
        <a className={buttonClass()} href="/explore">
          Back to explorer
        </a>
      </DialogBox>
    )
  }
  if (ready && !canFight) {
    return (
      <DialogBox className="flex flex-col items-center gap-4 text-center">
        <p className="text-body-lg">
          Your team is too tired to battle. Rest first!
        </p>
        <Button onClick={() => setTeam(restAll)}>Rest</Button>
      </DialogBox>
    )
  }
  return <Searching />
}

function NotFound() {
  return (
    <DialogBox className="flex flex-col items-center gap-4 text-center">
      <p className="text-body-lg">
        No creature to send out! Add one in the explorer first.
      </p>
      <a className={buttonClass()} href="/explore">
        Back to explorer
      </a>
    </DialogBox>
  )
}

function Searching() {
  return (
    <DialogBox className="text-center" showMore>
      <p className="text-body-lg" role="status">
        Searching the tall grass…
      </p>
    </DialogBox>
  )
}

// Sound (off until asked for) and the timing bar (on, unless reduced motion).
function SettingsToggles({
  fullscreen
}: {
  fullscreen: ReturnType<typeof useFullscreen>
}) {
  const [settings, setSettings] = useSettings()
  const reduced = usePrefersReducedMotion()
  const toggleClass = (pressed: boolean) =>
    buttonClass(pressed ? 'primary' : 'secondary', 'h-10 gap-1.5 px-3')
  return (
    <div
      aria-label="Battle settings"
      className="flex flex-wrap gap-2"
      role="group"
    >
      {fullscreen.supported && (
        <button
          className={toggleClass(false)}
          onClick={() => void fullscreen.toggle()}
          type="button"
        >
          <span aria-hidden>⛶</span>
          Full screen
        </button>
      )}
      <button
        aria-pressed={settings.sound}
        className={toggleClass(settings.sound)}
        onClick={() => {
          // Browsers allow audio only after a user gesture: this is it.
          unlockAudio()
          setSettings(current => ({ ...current, sound: !current.sound }))
        }}
        type="button"
      >
        <span aria-hidden>{settings.sound ? '🔊' : '🔇'}</span>
        Sound
      </button>
      <button
        aria-pressed={settings.timing && !reduced}
        className={toggleClass(settings.timing && !reduced)}
        disabled={reduced}
        onClick={() =>
          setSettings(current => ({ ...current, timing: !current.timing }))
        }
        title={reduced ? 'Off while reduced motion is on' : undefined}
        type="button"
      >
        <span aria-hidden>⏱</span>
        Timing
      </button>
      <button
        aria-pressed={settings.classic}
        className={toggleClass(settings.classic)}
        onClick={() =>
          setSettings(current => ({ ...current, classic: !current.classic }))
        }
        title="The battle screen in four greens"
        type="button"
      >
        <span
          aria-hidden
          className="size-3 border-2 border-current bg-[#8bac0f]"
        />
        Classic
      </button>
    </div>
  )
}
