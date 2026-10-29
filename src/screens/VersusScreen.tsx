import { type ReactNode, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { ConsoleScreen } from '@/components/battle/ConsoleScreen'
import { FloatingQuestion } from '@/components/battle/FloatingQuestion'
import { Handheld } from '@/components/battle/Handheld'
import { SettingsToggles } from '@/components/battle/SettingsToggles'
import { TeamPicker } from '@/components/battle/TeamPicker'
import { VersusArena } from '@/components/battle/VersusArena'
import { DialogBox } from '@/components/DialogBox'
import { HomeLink } from '@/components/HomeLink'
import { Button, buttonClass } from '@/components/ui/button'
import { useFullscreen } from '@/hooks/useFullscreen'
import { useMatch } from '@/hooks/useMatch'
import { useSettings } from '@/hooks/useSettings'
import { useTeam } from '@/hooks/useTeam'
import { isCustomId } from '@/lib/creature'
import {
  addMember,
  hasCreature,
  makeUid,
  newMember,
  type TeamMember
} from '@/lib/team/team'
import { createMatch, matchPath, saveToken } from '@/lib/versus-api'

const SECRET = "Your friend's team is a secret"

// `/battle/vs/<id>`: the 8-character match id (the server's alphabet).
export function parseMatchId(pathname: string): null | string {
  const match = /^\/battle\/vs\/([abcdefghjkmnpqrstuvwxyz23456789]{8})$/.exec(
    pathname
  )
  return match ? match[1] : null
}

// No id: create a match. With one: take a seat in it (or reclaim this tab's).
export function VersusScreen({ matchId }: { matchId: null | string }) {
  const [settings] = useSettings()
  const stageRef = useRef<HTMLDivElement>(null)
  const fullscreen = useFullscreen(stageRef)
  // The host's invitation sits beside the console, not on its screen.
  const [inviteSlot, setInviteSlot] = useState<HTMLDivElement | null>(null)
  return (
    <main className="mx-auto flex max-w-[960px] flex-col gap-4 px-4 pt-6 pb-16 xs:px-6 md:max-w-[1240px] lg:grid lg:grid-cols-[minmax(12rem,1fr)_auto_minmax(0,1fr)] lg:items-start lg:gap-8 lg:py-3">
      <header className="flex flex-wrap items-center justify-between gap-3 lg:flex-col lg:items-start lg:pt-6">
        <h1 className="text-heading font-bold uppercase">Battle</h1>
        <div className="flex flex-wrap items-center gap-3 lg:flex-col lg:items-start">
          <SettingsToggles fullscreen={fullscreen} timingAlwaysOn />
          <HomeLink />
        </div>
        <div className="w-full lg:max-w-80" ref={setInviteSlot} />
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
          <Match inviteSlot={inviteSlot} matchId={matchId} />
        </Handheld>
      </div>
    </main>
  )
}

function Create({ onCreated }: { onCreated: (matchId: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<null | string>(null)

  async function create() {
    setBusy(true)
    setError(null)
    try {
      const { matchId, token } = await createMatch()
      saveToken(matchId, token)
      window.history.replaceState(null, '', matchPath(matchId))
      onCreated(matchId)
    } catch (caught) {
      console.error('Could not create the match', caught)
      setError(
        caught instanceof Error ? caught.message : 'Could not create the match'
      )
      setBusy(false)
    }
  }

  return (
    <ConsoleScreen>
      <DialogBox className="flex flex-col items-center gap-4 text-center">
        <h2 className="text-heading font-bold uppercase">Battle a friend</h2>
        <p className="text-body-lg">
          Make a match, then send your friend the link. Each of you picks a team
          in secret.
        </p>
        {error && (
          <p className="text-body-lg font-bold text-danger" role="alert">
            {error}
          </p>
        )}
        <Button disabled={busy} onClick={() => void create()}>
          Create match
        </Button>
      </DialogBox>
    </ConsoleScreen>
  )
}

function Lobby({
  inviteSlot,
  matchId
}: {
  inviteSlot: HTMLElement | null
  matchId: string
}) {
  const { retry, send, status, view } = useMatch(matchId)
  // The friend match's own team: seeded from the saved one (minus Creature
  // Lab creatures, which the server can't know), never written back to it.
  // Until you change it, it is the saved team (which loads from the API a moment
  // after the screen opens); from your first change on, it's this match's own.
  const [saved] = useTeam()
  const [picked, setPicked] = useState<null | TeamMember[]>(null)
  const team = picked ?? saved.filter(member => !isCustomId(member.creatureId))
  const setTeam = (change: (current: TeamMember[]) => TeamMember[]) =>
    setPicked(change(team))
  const [sendError, setSendError] = useState(false)

  if (status === 'connecting' || (status === 'live' && !view)) {
    return (
      <ConsoleScreen>
        <DialogBox className="text-center">
          <p className="text-body-lg" role="status">
            Connecting…
          </p>
        </DialogBox>
      </ConsoleScreen>
    )
  }
  if (status === 'error') {
    return (
      <Message>
        <p className="text-body-lg font-bold text-danger" role="alert">
          Couldn&apos;t reach the server.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={retry}>Try again</Button>
          <a className={buttonClass('secondary')} href="/battle">
            Back to Battle
          </a>
        </div>
      </Message>
    )
  }
  if (status === 'full') {
    return (
      <Message>
        <p className="text-body-lg">This match is already full.</p>
        <a className={buttonClass('secondary')} href="/battle">
          Back to Battle
        </a>
      </Message>
    )
  }
  if (status === 'replaced') {
    return (
      <Message>
        <p className="text-body-lg">This match is open in another tab.</p>
        <a className={buttonClass('secondary')} href="/battle">
          Back to Battle
        </a>
      </Message>
    )
  }
  if (status === 'gone' || !view) {
    return (
      <Message>
        <p className="text-body-lg">This match has ended or expired.</p>
        <a className={buttonClass('secondary')} href="/battle/vs">
          New match
        </a>
      </Message>
    )
  }

  if ((view.phase === 'battle' || view.phase === 'over') && view.battle) {
    return (
      <VersusArena
        onNewMatch={() => window.location.assign('/battle/vs')}
        send={send}
        view={view}
      />
    )
  }

  const inviting = !view.opponent.joined
  // Locked in before the friend arrived, the host still needs the link.
  const invite =
    inviting &&
    view.you === 'host' &&
    inviteSlot &&
    createPortal(<ShareLink matchId={matchId} />, inviteSlot)
  if (view.ready) {
    return (
      <ConsoleScreen>
        {invite}
        <DialogBox className="flex flex-col items-center gap-4 text-center">
          <FloatingQuestion className="text-[64px]" label={SECRET} />
          {!inviting && (
            <p className="text-body-lg" role="status">
              Waiting for your friend to pick…
            </p>
          )}
        </DialogBox>
      </ConsoleScreen>
    )
  }

  return (
    <ConsoleScreen className="justify-start gap-2">
      {invite}
      <div className="flex items-center gap-2 border-b-4 border-ink pb-2">
        <FloatingQuestion className="text-heading" label={SECRET} />
        <p className="text-label font-bold uppercase">{SECRET}</p>
      </div>
      {sendError && (
        <p className="text-label font-bold text-danger" role="alert">
          Couldn&apos;t send your team. Try again.
        </p>
      )}
      <div className="min-h-0 flex-1">
        <TeamPicker
          allowCustom={false}
          onStart={() => {
            setSendError(false)
            send({
              creatureIds: team.map(member => member.creatureId),
              type: 'team'
            }).catch((caught: unknown) => {
              console.error('Could not send the team', caught)
              setSendError(true)
            })
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
      </div>
    </ConsoleScreen>
  )
}

function Match({
  inviteSlot,
  matchId
}: {
  inviteSlot: HTMLElement | null
  matchId: null | string
}) {
  // The URL moves to the new match without a navigation, so the id it makes
  // is kept here.
  const [created, setCreated] = useState<null | string>(null)
  const id = matchId ?? created
  if (id === null) return <Create onCreated={setCreated} />
  return <Lobby inviteSlot={inviteSlot} key={id} matchId={id} />
}

function Message({ children }: { children: ReactNode }) {
  return (
    <ConsoleScreen>
      <DialogBox className="flex flex-col items-center gap-4 text-center">
        {children}
      </DialogBox>
    </ConsoleScreen>
  )
}

// The host's invitation: the link to send, until the friend is in.
function ShareLink({ matchId }: { matchId: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [copied, setCopied] = useState(false)
  const link = `${window.location.origin}${matchPath(matchId)}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      // No clipboard access: select the link so the player can copy it.
      inputRef.current?.select()
    }
  }

  return (
    <section
      aria-label="Invite a friend"
      className="flex flex-col gap-2 rounded-box frame-box bg-box p-3"
    >
      <h2 className="text-label font-bold uppercase">Invite a friend</h2>
      <input
        aria-label="Match link"
        className="h-11 w-full min-w-0 rounded-tag border-2 border-ink bg-white px-2 text-label focus-visible:focus-ring"
        onFocus={event => event.currentTarget.select()}
        readOnly
        ref={inputRef}
        value={link}
      />
      <Button onClick={() => void copy()} variant="secondary">
        {copied ? 'Copied' : 'Copy link'}
      </Button>
      <p className="text-label text-ink-muted" role="status">
        Waiting for a friend…
      </p>
    </section>
  )
}
