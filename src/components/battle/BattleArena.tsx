import { useEffect, useReducer, useRef, useState } from 'react'

import { DialogBox } from '@/components/DialogBox'
import { TypeBadge } from '@/components/TypeBadge'
import { Button } from '@/components/ui/button'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { useSettings } from '@/hooks/useSettings'
import { useTypewriter } from '@/hooks/useTypewriter'
import {
  abandonWildBattle,
  BattleRequestError,
  sendWildAction,
  type WildAction,
  type WildBattle
} from '@/lib/battle/api'
import { activeFighter, MAX_TEAM } from '@/lib/battle/engine'
import {
  currentStep,
  flowReducer,
  type Outcome,
  startFlow
} from '@/lib/battle/flow'
import { playSound } from '@/lib/sound'

import {
  caption,
  useBodyAdvance,
  useCueSound,
  usePhaseFocus
} from './arena-hooks'
import { BattleMenu, type MenuItem } from './BattleMenu'
import { BattleScene } from './BattleScene'
import { TimingBar } from './TimingBar'

type BattleArenaProps = {
  // The battle as the server has it: a new one, or one resumed after a reload.
  initial: WildBattle
  onBattleAgain: () => void
  onChangeTeam?: () => void
  // The client lost track of the battle (an answer that never arrived, a turn
  // the server already played): start over from the server's copy.
  onResync: () => void
  // After every turn: the server has saved HP, XP and catches to the team.
  onTurn: () => void
  // The saved team can be bigger than the party (members no longer on file),
  // and a catch only sticks if the saved team has room.
  teamSize: number
}

// One battle from "A wild X appeared!" to the end screen. Remount (new `key`)
// to start over.
export function BattleArena({
  initial,
  onBattleAgain,
  onChangeTeam,
  onResync,
  onTurn,
  teamSize
}: BattleArenaProps) {
  const [flow, dispatch] = useReducer(flowReducer, null, () =>
    startFlow(initial.state)
  )
  const enemy = initial.state.enemy
  // The turn the next action is for; the server rejects any other (a double
  // click or a stale retry).
  const turn = useRef(initial.turn)
  // A request is on its way: the menus wait for its answer.
  const [busy, setBusy] = useState(false)
  // Why the last request failed, and whether "Try again" can help.
  const [failed, setFailed] = useState<null | {
    message: string
    // Not for a plain refusal (400): retrying it can't succeed.
    retry: boolean
  }>(null)
  const retryRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (failed?.retry) retryRef.current?.focus()
  }, [failed])
  const instant = usePrefersReducedMotion()
  const [settings] = useSettings()
  // The timing bar needs motion; reduced motion falls back to plain moves.
  const timingOn = settings.timing && !instant
  // The move waiting on the timing bar, if any.
  const [pending, setPending] = useState<null | number>(null)
  const { battle, phase } = flow
  const step = currentStep(flow)
  const active = activeFighter(battle)

  const prompt =
    phase === 'switch'
      ? 'Who will you send out?'
      : `What will ${active.creature.name} do?`
  const text = step?.text ?? prompt
  const typed = useTypewriter(text, String(flow.messageId), instant)
  const canAdvance = phase === 'messages'
  // First press finishes the line, the next one moves on.
  const advance = () =>
    typed.done ? dispatch({ type: 'advance' }) : typed.finish()

  const { endRef, lastMove, menuRef, messageRef } = usePhaseFocus(
    pending !== null ? 'timing' : phase
  )

  // Each message plays its cue once; a win or catch ends on a jingle.
  useCueSound(flow.messageId, step?.cue, settings.sound)
  useEffect(() => {
    if (!settings.sound || phase !== 'end') return
    if (flow.outcome === 'won' || flow.outcome === 'caught')
      playSound('victory')
    // Keyed on phase only: play on reaching the end, not on a later toggle.
  }, [phase])

  useBodyAdvance(canAdvance, advance)

  // One action to the server, then its events into the message flow.
  const act = (action: WildAction) => {
    setBusy(true)
    setFailed(null)
    sendWildAction(turn.current, action)
      .then(
        result => {
          turn.current = result.turn
          dispatch({
            events: result.events,
            state: result.state,
            type: 'resolved'
          })
          onTurn()
        },
        (error: unknown) => {
          // A 400 is a refusal with a reason. Anything else (no answer, a 5xx,
          // a turn the server already played) means this screen may be out of
          // date, so "Try again" reloads the battle from the server rather than
          // resending: the turn may have happened even though the answer was lost.
          const status = error instanceof BattleRequestError ? error.status : 0
          setFailed(
            status === 400
              ? { message: (error as Error).message, retry: false }
              : { message: "Couldn't reach the server", retry: true }
          )
        }
      )
      .finally(() => setBusy(false))
  }

  // Running away ends the battle on the server first, so "Battle again" can't
  // race it (and a reload can't bring back a battle you left).
  const runAway = () => {
    setBusy(true)
    setFailed(null)
    abandonWildBattle()
      .then(
        () => dispatch({ type: 'run' }),
        () => setFailed({ message: "Couldn't reach the server", retry: true })
      )
      .finally(() => setBusy(false))
  }

  const teamFull = Math.max(battle.party.length, teamSize) >= MAX_TEAM
  const mainItems: MenuItem[] = [
    {
      key: 'fight',
      label: 'Fight',
      onSelect: () => dispatch({ type: 'fight' })
    },
    { key: 'team', label: 'Team', onSelect: () => dispatch({ type: 'team' }) },
    {
      detail: teamFull ? caption('Team full') : undefined,
      disabled: teamFull,
      key: 'catch',
      label: 'Catch',
      onSelect: () => act({ type: 'catch' })
    },
    {
      key: 'run',
      label: 'Run',
      onSelect: runAway
    }
  ]
  const moveItems: MenuItem[] = active.moves.map((move, index) => ({
    detail: (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <TypeBadge type={move.type} />
        {caption(`PWR ${move.power} · ACC ${move.accuracy}`)}
      </span>
    ),
    key: move.name,
    label: move.name,
    onSelect: () => {
      lastMove.current = index
      if (timingOn) setPending(index)
      else act({ index, type: 'move' })
    }
  }))
  const teamItems: MenuItem[] = battle.party.map((fighter, index) => {
    const status =
      index === battle.active
        ? ' · In battle'
        : fighter.hp === 0
          ? ' · Fainted'
          : ''
    return {
      detail: caption(
        `Lv${fighter.level} · HP ${fighter.hp}/${fighter.maxHp}${status}`
      ),
      disabled: fighter.hp === 0 || index === battle.active,
      key: fighter.uid,
      label: fighter.creature.name,
      onSelect: () =>
        act({ to: index, type: phase === 'switch' ? 'sendOut' : 'switch' })
    }
  })

  const outcome = flow.outcome && outcomeCopy(flow.outcome, enemy.creature.name)
  const announcement =
    phase === 'end' && outcome
      ? `${outcome.title} ${outcome.line}`
      : pending !== null
        ? 'Timing bar: press Space or Enter to strike.'
        : text
  const ribbon =
    phase === 'end' && flow.outcome === 'won'
      ? 'Victory!'
      : phase === 'end' && flow.outcome === 'caught'
        ? 'Gotcha!'
        : null

  let menu
  if (phase === 'moves' && pending !== null) {
    menu = (
      <TimingBar
        onCancel={() => setPending(null)}
        onDone={bonus => {
          setPending(null)
          act({ index: pending, timing: bonus, type: 'move' })
        }}
      />
    )
  } else if (phase === 'moves') {
    menu = (
      <BattleMenu
        cols={2}
        disabled={busy}
        items={moveItems}
        label="Moves"
        onBack={() => dispatch({ type: 'back' })}
        ref={menuRef}
      />
    )
  } else if (phase === 'team' || phase === 'switch') {
    menu = (
      <BattleMenu
        cols={2}
        disabled={busy}
        items={teamItems}
        label="Team"
        // A forced switch has no way back: someone must go out.
        onBack={phase === 'team' ? () => dispatch({ type: 'back' }) : undefined}
        ref={menuRef}
      />
    )
  } else {
    menu = (
      <BattleMenu
        cols={2}
        disabled={busy || phase !== 'menu'}
        items={mainItems}
        label="Actions"
        ref={menuRef}
      />
    )
  }

  return (
    <section
      aria-label="Battle"
      className="flex flex-col gap-3 rounded-box frame-box bg-box p-2 sm:p-3"
    >
      <BattleScene
        enemy={flow.shown.enemy}
        fainted={flow.fainted}
        instant={instant}
        messageId={flow.messageId}
        player={flow.shown.player}
        ribbon={ribbon}
        shownHp={flow.shownHp}
        step={step}
      />

      {/* Full messages for screen readers, not the half-typed ones. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {phase === 'end' && outcome ? (
        <DialogBox className="flex flex-col items-start gap-3 text-left">
          <h2 className="text-heading font-bold uppercase">{outcome.title}</h2>
          <p className="text-body-lg">{outcome.line}</p>
          <div className="flex flex-wrap gap-3" data-arrow-nav>
            <Button onClick={onBattleAgain} ref={endRef}>
              Battle again
            </Button>
            {onChangeTeam && (
              <Button onClick={onChangeTeam} variant="secondary">
                Change team
              </Button>
            )}
          </div>
        </DialogBox>
      ) : (
        // The handheld reshapes it (globals.css).
        <div
          className="grid gap-3 sm:min-h-68 sm:grid-cols-2"
          data-battle-console
        >
          <DialogBox
            className="min-h-28 sm:min-h-32"
            showMore={canAdvance && typed.done}
            tone="dark"
          >
            <p aria-hidden className="text-body-lg">
              {typed.shown}
            </p>
            {canAdvance && (
              // Stretched over the box, like the card's name button.
              <button
                aria-label="Next message"
                className="absolute inset-0 rounded-inset focus-visible:focus-ring"
                onClick={advance}
                ref={messageRef}
                type="button"
              />
            )}
          </DialogBox>
          <DialogBox className="flex flex-col gap-2 p-2 sm:p-3">
            {failed && (
              <div className="flex flex-wrap items-center gap-2" role="alert">
                <p className="text-body font-bold text-danger">
                  {failed.message}
                </p>
                {failed.retry && (
                  <Button onClick={onResync} ref={retryRef} variant="secondary">
                    Try again
                  </Button>
                )}
              </div>
            )}
            {menu}
          </DialogBox>
        </div>
      )}
    </section>
  )
}

function outcomeCopy(outcome: Outcome, wildName: string) {
  switch (outcome) {
    case 'caught':
      return { line: `${wildName} joined your team.`, title: 'Gotcha!' }
    case 'lost':
      return { line: 'Rest your team, then try again.', title: 'You lost…' }
    case 'ran':
      return { line: 'You fled the battle.', title: 'Got away!' }
    case 'won':
      return { line: 'The wild creature was defeated.', title: 'You won!' }
  }
}
