import { useEffect, useReducer, useRef, useState } from 'react'

import { DialogBox } from '@/components/DialogBox'
import { TypeBadge } from '@/components/TypeBadge'
import { Button, buttonClass } from '@/components/ui/button'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { useSettings } from '@/hooks/useSettings'
import { useTypewriter } from '@/hooks/useTypewriter'
import {
  activeFighter,
  type BattleEvent,
  type BattleState,
  createBattle,
  type Fighter,
  MAX_TEAM,
  resolveTurn,
  type Rng,
  sendOut
} from '@/lib/battle/engine'
import {
  currentStep,
  flowReducer,
  type Outcome,
  startFlow
} from '@/lib/battle/flow'
import { playSound } from '@/lib/sound'

import { BattleMenu, type MenuItem } from './BattleMenu'
import { BattleScene } from './BattleScene'
import { TimingBar } from './TimingBar'

type BattleArenaProps = {
  enemy: Fighter
  onBattleAgain: () => void
  // Called after every turn so HP, XP and catches survive a closed tab.
  onSave: (state: BattleState) => void
  party: Fighter[]
  rng: Rng
  // The saved team can be bigger than `party` (members no longer on file),
  // and a catch only sticks if the saved team has room.
  teamSize: number
}

type Result = { events: BattleEvent[]; state: BattleState }

const caption = (text: string) => (
  <span className="text-caption text-ink-muted">{text}</span>
)

// One battle from "A wild X appeared!" to the end screen. Remount (new `key`)
// to start over.
export function BattleArena({
  enemy,
  onBattleAgain,
  onSave,
  party,
  rng,
  teamSize
}: BattleArenaProps) {
  const [flow, dispatch] = useReducer(flowReducer, null, () =>
    startFlow(createBattle(party, enemy))
  )
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

  const messageRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLButtonElement>(null)
  const lastMove = useRef(0)

  // Each phase hands focus to its control, so the keyboard never drops to <body>.
  useEffect(() => {
    if (pending !== null) return // the timing bar focuses itself
    if (phase === 'messages') messageRef.current?.focus()
    else if (phase === 'end') endRef.current?.focus()
    else if (phase === 'moves') {
      menuRef.current?.querySelectorAll('button')[lastMove.current]?.focus()
    } else {
      menuRef.current
        ?.querySelector<HTMLButtonElement>('button:enabled')
        ?.focus()
    }
  }, [pending, phase])

  // Each message plays its cue once; a win or catch ends on a jingle.
  const played = useRef(-1)
  useEffect(() => {
    if (!settings.sound || played.current === flow.messageId) return
    played.current = flow.messageId
    if (step?.cue) playSound(step.cue)
  }, [flow.messageId, settings.sound, step?.cue])
  useEffect(() => {
    if (!settings.sound || phase !== 'end') return
    if (flow.outcome === 'won' || flow.outcome === 'caught')
      playSound('victory')
    // Keyed on phase only: play on reaching the end, not on a later toggle.
  }, [phase])

  // Enter/Space still advance after a click elsewhere left focus on <body>.
  const advanceRef = useRef(advance)
  useEffect(() => {
    advanceRef.current = advance
  })
  useEffect(() => {
    if (!canAdvance) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target !== document.body) return
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      advanceRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canAdvance])

  const act = (result: Result) => {
    dispatch({ type: 'resolved', ...result })
    onSave(result.state)
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
      onSelect: () => act(resolveTurn(battle, { type: 'catch' }, rng))
    },
    { key: 'run', label: 'Run', onSelect: () => dispatch({ type: 'run' }) }
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
      else act(resolveTurn(battle, { index, type: 'move' }, rng))
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
        act(
          phase === 'switch'
            ? sendOut(battle, index)
            : resolveTurn(battle, { to: index, type: 'switch' }, rng)
        )
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
          act(
            resolveTurn(
              battle,
              { index: pending, timing: bonus, type: 'move' },
              rng
            )
          )
        }}
      />
    )
  } else if (phase === 'moves') {
    menu = (
      <BattleMenu
        cols={2}
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
        disabled={phase !== 'menu'}
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
          <div className="flex flex-wrap gap-3">
            <Button onClick={onBattleAgain} ref={endRef}>
              Battle again
            </Button>
            <a className={buttonClass('secondary')} href="/explore">
              Back to explorer
            </a>
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
