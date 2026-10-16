import { CreatureArt } from '@/components/CreatureArt'
import { HpBar } from '@/components/HpBar'
import { Cloud } from '@/components/LandingScene'
import { TypeBadge } from '@/components/TypeBadge'
import { useSteppedNumber } from '@/hooks/useSteppedNumber'
import { type Fighter, type Side } from '@/lib/battle/engine'
import { type Step } from '@/lib/battle/script'
import { xpProgress } from '@/lib/battle/stats'
import { cn } from '@/lib/utils'

type BattleSceneProps = {
  enemy: Fighter
  fainted: Record<Side, boolean>
  // Reduced motion: no flashes, sparkles or moving effects.
  instant: boolean
  // Changes with every message, so an effect restarts even if it repeats.
  messageId: number
  player: Fighter
  // "VICTORY!" / "GOTCHA!" at the end of a battle.
  ribbon: null | string
  shownHp: Record<Side, number>
  // The message on screen, which says what the scene should do.
  step?: Step
}

type InfoBoxProps = {
  fighter: Fighter
  flash: boolean
  hp: number
  instant: boolean
  side: Side
}

type Motion = 'hit' | 'lunge' | null

type OrbState = 'caught' | 'drop' | 'open' | 'wobble'

type SpriteProps = {
  className: string
  damage?: { amount: number; crit: boolean }
  effectKey: number
  fainted: boolean
  fighter: Fighter
  hidden: boolean
  motion: Motion
  side: Side
  sparkle: boolean
}

const ORB_STATES: Partial<Record<NonNullable<Step['cue']>, OrbState>> = {
  breakFree: 'open',
  caught: 'caught',
  shake: 'wobble',
  throw: 'drop'
}

// Sky over a grass strip; the wild creature top right, the player's bottom
// left, each with an info box on the opposite side.
export function BattleScene({
  enemy,
  fainted,
  instant,
  messageId,
  player,
  ribbon,
  shownHp,
  step
}: BattleSceneProps) {
  const effects = !instant
  const crit = effects && step?.damage?.crit === true
  const orb = step?.cue ? ORB_STATES[step.cue] : undefined
  const damageOn = (side: Side) =>
    step?.damage?.side === side ? step.damage : undefined
  const sparkleOn = (side: Side) =>
    effects && step?.cue === 'super' && step.at === side

  return (
    <div
      className={cn(
        'relative aspect-square overflow-hidden rounded-inset frame-inset xs:aspect-[4/3] sm:aspect-[16/9]',
        crit && 'animate-scene-shake'
      )}
      // The handheld reshapes it (globals.css).
      data-battle-scene
    >
      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(180deg,var(--color-sky-top)_0%,var(--color-sky-3)_45%,var(--color-sky-horizon)_58%)]"
      />
      <div
        aria-hidden
        className="absolute top-[8%] left-[56%] w-[14%] opacity-90"
      >
        <Cloud />
      </div>
      <div
        aria-hidden
        className="absolute top-[30%] left-[38%] w-[9%] opacity-80"
      >
        <Cloud />
      </div>
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-[42%] border-t-4 border-hill-2 bg-hill-1"
      />

      <div className="absolute top-[4%] left-[3%] w-[54%] max-w-[17rem] xs:w-[48%]">
        <InfoBox
          fighter={enemy}
          flash={false}
          hp={shownHp.enemy}
          instant={instant}
          key={enemy.uid}
          side="enemy"
        />
      </div>
      <Sprite
        className="top-[8%] right-[5%] w-[36%] sm:top-[6%] sm:w-[30%]"
        damage={damageOn('enemy')}
        effectKey={messageId}
        fainted={fainted.enemy}
        fighter={enemy}
        // Inside the orb while it shakes.
        hidden={orb === 'drop' || orb === 'wobble'}
        key={enemy.uid}
        motion={motionFor('enemy', step?.hit)}
        side="enemy"
        sparkle={sparkleOn('enemy')}
      />
      {orb && <Orb effectKey={messageId} effects={effects} state={orb} />}

      <Sprite
        className="bottom-[3%] left-[3%] w-[40%] sm:w-[34%]"
        damage={damageOn('player')}
        effectKey={messageId}
        fainted={fainted.player}
        fighter={player}
        hidden={false}
        key={player.uid}
        motion={motionFor('player', step?.hit)}
        side="player"
        sparkle={sparkleOn('player')}
      />
      <div className="absolute right-[3%] bottom-[6%] w-[54%] max-w-[17rem] xs:w-[48%]">
        <InfoBox
          fighter={player}
          flash={effects && step?.cue === 'levelUp'}
          hp={shownHp.player}
          instant={instant}
          key={player.uid}
          side="player"
        />
      </div>

      {crit && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 animate-crit-flash bg-white"
          key={messageId}
        />
      )}
      {ribbon && (
        <div
          aria-hidden
          className="absolute inset-x-0 top-[38%] flex animate-ribbon-drop justify-center"
        >
          <span className="rounded-tag frame-tag bg-accent px-4 py-1 text-heading font-bold uppercase">
            {ribbon}
          </span>
        </div>
      )}
    </div>
  )
}

function InfoBox({ fighter, flash, hp, instant, side }: InfoBoxProps) {
  const shown = useSteppedNumber(hp, fighter.maxHp, instant)
  const { creature } = fighter
  return (
    <section
      aria-label={side === 'enemy' ? 'Wild creature' : 'Your creature'}
      className={cn(
        'flex flex-col gap-1 rounded-box frame-box bg-box px-2 py-1.5 sm:gap-1.5 sm:px-3 sm:py-2.5',
        flash && 'animate-gold-flash'
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="truncate text-label font-bold uppercase sm:text-card-title">
          {creature.name}
        </h2>
        <span className="shrink-0 text-caption">Lv{fighter.level}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {creature.types.map(type => (
          <TypeBadge key={type} type={type} />
        ))}
      </div>
      <HpBar hp={shown} max={fighter.maxHp} />
      {side === 'player' && (
        <span
          aria-hidden
          className="block h-1.5 overflow-hidden rounded-inset bg-track"
        >
          <span
            className="block h-full bg-focus"
            style={{ width: `${xpProgress(fighter.level, fighter.xp) * 100}%` }}
          />
        </span>
      )}
    </section>
  )
}

function motionFor(side: Side, attacker: Side | undefined): Motion {
  if (!attacker) return null
  return attacker === side ? 'lunge' : 'hit'
}

// An original capture orb on the wild creature's platform: it drops in,
// wobbles once per shake, then shuts with sparkles or pops open.
function Orb({
  effectKey,
  effects,
  state
}: {
  effectKey: number
  effects: boolean
  state: OrbState
}) {
  return (
    <div
      aria-hidden
      className="absolute top-[30%] right-[14%] w-[9%] sm:top-[24%] sm:right-[12%] sm:w-[7%]"
      data-orb={state}
    >
      <svg
        className={cn(
          'w-full',
          state === 'drop' && 'animate-orb-drop',
          state === 'wobble' && 'animate-orb-wobble',
          state === 'open' && 'animate-orb-pop'
        )}
        key={effectKey}
        shapeRendering="crispEdges"
        viewBox="0 0 10 10"
      >
        <path
          className="fill-ink"
          d="M3 0h4v1h2v2h1v4H9v2H7v1H3V9H1V7H0V3h1V1h2z"
        />
        <path className="fill-focus" d="M3 1h4v1h1v1h1v2H1V3h1V2h1z" />
        <path className="fill-accent" d="M1 5h8v2H8v1H7v1H3V8H2V7H1z" />
        <path className="fill-box" d="M4 4h2v2H4z" />
      </svg>
      {state === 'caught' && effects && <Sparkles />}
    </div>
  )
}

function Sparkles() {
  return (
    <div className="pointer-events-none absolute -inset-[60%] animate-sparkle">
      {[
        'top-0 left-1/2',
        'top-1/2 left-0',
        'top-1/2 right-0',
        'bottom-0 left-1/2'
      ].map(position => (
        <span
          className={cn('absolute size-[14%] bg-accent', position)}
          key={position}
        />
      ))}
    </div>
  )
}

// The creature's art standing on an oval platform. The art is decorative
// (the fixture images are random placeholders), so the scene is aria-hidden.
function Sprite({
  className,
  damage,
  effectKey,
  fainted,
  fighter,
  hidden,
  motion,
  side,
  sparkle
}: SpriteProps) {
  // Each side lunges toward the other one.
  const lunge =
    side === 'player' ? 'animate-lunge-player' : 'animate-lunge-enemy'
  return (
    <div
      aria-hidden
      className={cn('absolute flex flex-col items-center', className)}
    >
      <div
        className={cn(
          'relative z-10 -mb-[9%] aspect-square w-[62%]',
          motion === 'hit' && 'animate-hit',
          motion === 'lunge' && lunge,
          fainted && 'translate-y-6 animate-faint opacity-0',
          hidden && 'opacity-0'
        )}
        data-fainted={fainted || undefined}
        data-motion={motion ?? undefined}
      >
        <div className="size-full overflow-hidden rounded-inset frame-inset bg-inset">
          <CreatureArt
            // Square sprite, up to ~320px wide: 2x for retina.
            height={640}
            letterClassName="text-[clamp(32px,8vw,72px)]"
            name={fighter.creature.name}
            src={fighter.creature.imageUrl}
            type={fighter.creature.types[0] ?? 'Normal'}
            width={640}
          />
        </div>
        {sparkle && <Sparkles key={effectKey} />}
      </div>
      <div className="aspect-[7/2] w-full rounded-[50%] border-4 border-hill-3 bg-hill-2" />
      {damage && (
        // Centred by the wrapper: the animation owns `translate`.
        <div className="absolute inset-x-0 top-0 z-20 flex justify-center">
          <span
            className={cn(
              'animate-float-up text-heading font-bold [text-shadow:2px_2px_0_var(--color-ink)]',
              damage.crit ? 'text-accent' : 'text-white'
            )}
            key={effectKey}
          >
            −{damage.amount}
          </span>
        </div>
      )}
    </div>
  )
}
