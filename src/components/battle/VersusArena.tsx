import { useEffect, useReducer, useRef, useState } from 'react'

import { DialogBox } from '@/components/DialogBox'
import { HomeLink } from '@/components/HomeLink'
import { TypeBadge } from '@/components/TypeBadge'
import { Button } from '@/components/ui/button'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { useSettings } from '@/hooks/useSettings'
import { useTypewriter } from '@/hooks/useTypewriter'
import { activeFighter, type BattleState } from '@/lib/battle/engine'
import { ACTING, currentStep, flowReducer, startFlow } from '@/lib/battle/flow'
import { NO_BAR_BONUS } from '@/lib/battle/versus'
import { playSound } from '@/lib/sound'
import {
  type MatchAction,
  type MatchOutcome,
  type MatchView
} from '@/lib/versus-api'

import {
  caption,
  useBodyAdvance,
  useCueSound,
  usePhaseFocus
} from './arena-hooks'
import { BattleMenu, type MenuItem } from './BattleMenu'
import { BattleScene } from './BattleScene'
import { TimingBar } from './TimingBar'

type VersusArenaProps = {
  onNewMatch: () => void
  send: (action: MatchAction) => Promise<void>
  // Phase `battle` or `over`, so `battle` is set.
  view: MatchView
}

const WAITING = 'Waiting for your friend…'

// A friend match from the first send-out to the end screen. The server
// resolves turns; each newer `view.turn` is played through the same message
// flow as a wild battle.
export function VersusArena({ onNewMatch, send, view }: VersusArenaProps) {
  const [flow, dispatch] = useReducer(flowReducer, null, () => {
    const start = view.battle as BattleState
    const flow = startFlow(start)
    // Reloaded mid send-out: straight to choosing who goes out.
    if (!start.mustSwitch) return flow
    const fainted = { ...flow.fainted, player: true }
    return { ...flow, fainted, phase: 'switch' as const }
  })
  // Turns before mount already happened: a reload shows where things stand.
  const applied = useRef(view.turn)
  const [overAtMount] = useState(view.outcome !== null)
  const instant = usePrefersReducedMotion()
  const [settings] = useSettings()
  const [pending, setPending] = useState<null | number>(null)
  // The turn an action was sent on: no second action until the view moves on.
  const [sentOn, setSentOn] = useState<null | number>(null)
  const { battle, phase } = flow
  const step = currentStep(flow)
  const active = activeFighter(battle)

  // A turn that lands mid-messages waits until they finish.
  useEffect(() => {
    if (!view.battle || view.turn <= applied.current) return
    if (!ACTING.includes(phase)) return
    applied.current = view.turn
    dispatch({ events: view.events, state: view.battle, type: 'resolved' })
  }, [phase, view])

  const outcome = view.outcome
  const ended =
    outcome !== null &&
    (outcome.reason !== 'knockout' || phase === 'end' || overAtMount)
  // Also while a newer turn waits to be played, so the menu never lags it.
  const waiting =
    view.acted ||
    view.opponent.switching ||
    sentOn === view.turn ||
    view.turn > applied.current
  const away = view.phase === 'battle' && !view.opponent.connected

  const prompt =
    phase === 'switch'
      ? 'Who will you send out?'
      : away
        ? 'Waiting for your friend to reconnect…'
        : waiting
          ? WAITING
          : `What will ${active.creature.name} do?`
  const text = step?.text ?? prompt
  // Prompts retype when they change; messages retype on every new one.
  const typed = useTypewriter(
    text,
    step ? String(flow.messageId) : `${flow.messageId}:${prompt}`,
    instant
  )
  const canAdvance = phase === 'messages' && !ended
  const advance = () =>
    typed.done ? dispatch({ type: 'advance' }) : typed.finish()

  const { endRef, lastMove, menuRef, messageRef } = usePhaseFocus(
    pending !== null ? 'timing' : ended ? 'end' : phase,
    waiting
  )

  useCueSound(flow.messageId, step?.cue, settings.sound)
  useEffect(() => {
    if (settings.sound && ended && outcome.winner === 'you') {
      playSound('victory')
    }
    // Keyed on reaching the end only, not on a later toggle.
  }, [ended])

  useBodyAdvance(canAdvance, advance)

  // A rejected send (network, 409) frees the menu to try again.
  const submit = (action: MatchAction) => {
    if (waiting) return
    const turn = view.turn
    setSentOn(turn)
    send(action).catch((caught: unknown) => {
      console.error('Could not send the action', caught)
      setSentOn(current => (current === turn ? null : current))
    })
  }
  const move = (index: number, timing: number) => {
    submit({ index, timing, type: 'move' })
    dispatch({ type: 'back' })
  }

  const mainItems: MenuItem[] = [
    {
      key: 'fight',
      label: 'Fight',
      onSelect: () => dispatch({ type: 'fight' })
    },
    { key: 'team', label: 'Team', onSelect: () => dispatch({ type: 'team' }) },
    {
      key: 'forfeit',
      label: 'Forfeit',
      onSelect: () => submit({ type: 'forfeit' })
    }
  ]
  const moveItems: MenuItem[] = active.moves.map((item, index) => ({
    detail: (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <TypeBadge type={item.type} />
        {caption(`PWR ${item.power} · ACC ${item.accuracy}`)}
      </span>
    ),
    key: item.name,
    label: item.name,
    onSelect: () => {
      lastMove.current = index
      // The bar always runs in a friend match; reduced motion gets the
      // middle of its range instead.
      if (instant) move(index, NO_BAR_BONUS)
      else setPending(index)
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
      onSelect: () => {
        if (phase === 'switch' || view.battle?.mustSwitch) {
          submit({ to: index, type: 'sendOut' })
          return
        }
        submit({ to: index, type: 'switch' })
        dispatch({ type: 'back' })
      }
    }
  })

  const copy = outcome && outcomeCopy(outcome)
  const announcement =
    ended && copy
      ? `${copy.title} ${copy.line}`
      : pending !== null
        ? 'Timing bar: press Space or Enter to strike.'
        : text
  const ribbon = ended && outcome.winner === 'you' ? 'Victory!' : null

  let menu
  if (phase === 'moves' && pending !== null) {
    menu = (
      <TimingBar
        onCancel={() => setPending(null)}
        onDone={bonus => {
          setPending(null)
          move(pending, bonus)
        }}
      />
    )
  } else if (phase === 'moves') {
    menu = (
      <BattleMenu
        cols={2}
        disabled={waiting}
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
        disabled={waiting}
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
        disabled={phase !== 'menu' || waiting}
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

      {ended && copy ? (
        <DialogBox className="flex flex-col items-start gap-3 text-left">
          <h2 className="text-heading font-bold uppercase">{copy.title}</h2>
          <p className="text-body-lg">{copy.line}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={onNewMatch} ref={endRef}>
              New match
            </Button>
            <HomeLink />
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
          <DialogBox className="p-2 sm:p-3">{menu}</DialogBox>
        </div>
      )}
    </section>
  )
}

function outcomeCopy({ reason, winner }: MatchOutcome) {
  const won = winner === 'you'
  const title = won ? 'You won!' : 'You lost…'
  switch (reason) {
    case 'forfeit':
      return {
        line: won ? 'Your friend forfeited.' : 'You forfeited.',
        title
      }
    case 'knockout':
      return {
        line: won
          ? 'Your friend is out of creatures.'
          : "You're out of creatures.",
        title
      }
    case 'left':
      return {
        line: won ? 'Your friend left the battle.' : 'You were away too long.',
        title
      }
  }
}
