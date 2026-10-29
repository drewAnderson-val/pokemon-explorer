import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import { BattleArena } from '@/components/battle/BattleArena'
import { ConsoleScreen } from '@/components/battle/ConsoleScreen'
import { Handheld } from '@/components/battle/Handheld'
import { SettingsToggles } from '@/components/battle/SettingsToggles'
import { TeamPicker } from '@/components/battle/TeamPicker'
import { DialogBox } from '@/components/DialogBox'
import { HomeLink } from '@/components/HomeLink'
import { Button, buttonClass } from '@/components/ui/button'
import { useFullscreen } from '@/hooks/useFullscreen'
import { useSettings } from '@/hooks/useSettings'
import { useTeam, useTeamStatus } from '@/hooks/useTeam'
import { creatureQuery, useTeamCreatures } from '@/hooks/useTeamCreatures'
import { fetchWildBattle, startWildBattle } from '@/lib/battle/api'
import { createFighter } from '@/lib/battle/engine'
import { isCustomId } from '@/lib/creature'
import { reloadTeam, restTeam } from '@/lib/team/serverTeam'
import {
  addMember,
  hasCreature,
  isTeamFull,
  leadWith,
  makeUid,
  newMember
} from '@/lib/team/team'

type BattleScreenProps = {
  // From `?id=N` (the ▶ Battle link): that creature leads this battle.
  playerId: null | number
}

export function BattleScreen({ playerId }: BattleScreenProps) {
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
          <div className="flex flex-wrap items-center gap-3">
            <HomeLink />
            <a
              className="inline-flex h-11 items-center gap-1 text-label font-bold uppercase focus-visible:focus-ring"
              href="/battle/vs"
            >
              Battle a friend
              <span aria-hidden>▶</span>
            </a>
          </div>
        </div>
      </header>
      <div className="battle-stage" ref={stageRef}>
        {fullscreen.active && (
          <button
            className={buttonClass('secondary', 'fixed top-4 right-4 z-10')}
            onClick={() => void fullscreen.toggle()}
            type="button"
          >
            Exit full screen (Esc)
          </button>
        )}
        <Handheld classic={settings.classic}>
          <BattleLoader
            // Custom creatures can't join a server team until slice 6.
            playerId={
              playerId !== null && isCustomId(playerId) ? null : playerId
            }
          />
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

function BattleLoader({ playerId }: { playerId: null | number }) {
  const [team, setTeam] = useTeam()
  const [round, setRound] = useState(0)
  // The player chose to battle with their team as it is (from the full-team
  // message or the picker's START): the ▶ Battle pick no longer applies.
  const [ownTeam, setOwnTeam] = useState(false)
  // The console's team picker, opened from a message or the end of a battle.
  const [picking, setPicking] = useState(false)
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
    !ownTeam &&
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
    (!pickBlocked || ownTeam)
  const canFight = party.some(fighter => fighter.hp > 0)
  // An empty team (and no ▶ Battle pick on its way) opens the picker, which
  // then stays until START, not just until the first creature joins.
  // Only once the team has loaded from the API: until then it looks empty.
  const { loaded } = useTeamStatus()
  const needsTeam =
    loaded && team.length === 0 && (playerId === null || pick.isError)
  useEffect(() => {
    if (needsTeam) setPicking(true)
  }, [needsTeam])
  const showPicker = picking || needsTeam
  // The server picks the wild creature and keeps the battle. The first round
  // resumes one in progress (a reload mid-battle); later rounds start fresh.
  const wild = useQuery({
    enabled: ready && canFight && !showPicker,
    gcTime: 0,
    queryFn: async () =>
      (round === 0 ? await fetchWildBattle() : null) ?? startWildBattle(),
    queryKey: ['battle', 'wild', round],
    retry: false,
    staleTime: Infinity
  })

  if (showPicker) {
    return (
      <ConsoleScreen className="justify-start">
        <TeamPicker
          onStart={() => {
            setPicking(false)
            setOwnTeam(true)
            setRound(r => r + 1)
          }}
          onToggle={creature =>
            setTeam(current =>
              hasCreature(current, creature.id)
                ? current.filter(member => member.creatureId !== creature.id)
                : addMember(current, newMember(creature, makeUid()))
            )
          }
          team={team}
        />
      </ConsoleScreen>
    )
  }
  const changeTeam = () => setPicking(true)

  // A started battle keeps going even when saving makes the team "tired".
  if (wild.data) {
    return (
      <BattleArena
        initial={wild.data}
        key={round}
        onBattleAgain={() => setRound(r => r + 1)}
        onChangeTeam={changeTeam}
        onTurn={() => void reloadTeam()}
        teamSize={team.length}
      />
    )
  }
  return <ConsoleScreen>{message()}</ConsoleScreen>

  // Everything short of a battle: a message on the console's screen.
  function message() {
    if (team.length === 0) return <Searching />
    if (pickBlocked && !ownTeam) {
      return (
        <DialogBox className="flex flex-col items-center gap-4 text-center">
          <p className="text-body-lg">
            Your team is full, so {pick.data?.name} can't join. Make room, or
            battle with your team.
          </p>
          <div className="flex flex-wrap justify-center gap-3" data-arrow-nav>
            <Button onClick={() => setOwnTeam(true)}>
              Battle with my team
            </Button>
            <Button onClick={changeTeam} variant="secondary">
              Change team
            </Button>
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
            Your team's creatures are no longer on file. Pick new ones.
          </p>
          <Button onClick={changeTeam}>Change team</Button>
        </DialogBox>
      )
    }
    if (ready && !canFight) {
      return (
        <DialogBox className="flex flex-col items-center gap-4 text-center">
          <p className="text-body-lg">
            Your team is too tired to battle. Rest first!
          </p>
          <div className="flex flex-wrap justify-center gap-3" data-arrow-nav>
            <Button onClick={() => void restTeam()}>Rest</Button>
            <Button onClick={changeTeam} variant="secondary">
              Change team
            </Button>
          </div>
        </DialogBox>
      )
    }
    return <Searching />
  }
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
