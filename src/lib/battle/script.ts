import {
  activeFighter,
  type BattleEvent,
  type BattleState,
  type Fighter,
  type Side
} from './engine'

// A sound (and matching visual effect) for a message.
export type Cue =
  | 'breakFree'
  | 'caught'
  | 'crit'
  | 'faint'
  | 'hit'
  | 'levelUp'
  | 'shake'
  | 'super'
  | 'throw'
  | 'weak'

// One message in the dialog box, plus what the scene should do when it shows.
export type Step = {
  // Which side a cue's effect plays on, when it isn't the damage side.
  at?: Side
  cue?: Cue
  // A floating damage number over this side.
  damage?: { amount: number; crit: boolean; side: Side }
  faint?: Side
  // The attacking side lunges and the other side shakes.
  hit?: Side
  // Set this side's HP bar (it drains toward the value).
  hp?: { side: Side; value: number }
  // Swap the creature (or its level) the scene shows for this side.
  show?: { fighter: Fighter; side: Side }
  text: string
}

const VISIBLE_SHAKES = 3

// Names repeat across creatures, so the enemy is always "Wild X" (or "Foe X"
// against a friend).
export function displayName(state: BattleState, side: Side) {
  return side === 'enemy'
    ? `${state.versus ? 'Foe' : 'Wild'} ${state.enemy.creature.name}`
    : activeFighter(state).creature.name
}

export function effectivenessText(multiplier: number, target: string) {
  if (multiplier === 0) return `It doesn't affect ${target}…`
  if (multiplier > 1) return "It's super effective!"
  if (multiplier < 1) return "It's not very effective…"
  return null
}

export function introSteps(state: BattleState): Step[] {
  if (state.versus) {
    return [
      { text: `Your friend sent out ${state.enemy.creature.name}!` },
      { text: `Go! ${activeFighter(state).creature.name}!` }
    ]
  }
  return [
    { text: `A wild ${state.enemy.creature.name} appeared!` },
    { text: `Go! ${activeFighter(state).creature.name}!` }
  ]
}

// Damage rides on the "X used Y!" step, so the bar drains while that line is
// up; crit and effectiveness get their own lines after it.
export function stepsFor(state: BattleState, events: BattleEvent[]): Step[] {
  const steps: Step[] = []
  for (const event of events) {
    switch (event.type) {
      case 'blackout':
        steps.push({ text: "You're out of creatures!" })
        break
      case 'catch': {
        steps.push({ cue: 'throw', text: 'You threw a ball!' })
        for (let i = 0; i < Math.min(event.shakes, VISIBLE_SHAKES); i++) {
          steps.push({ cue: 'shake', text: 'The ball shook…' })
        }
        steps.push(
          event.shakes === 4
            ? {
                cue: 'caught',
                faint: 'enemy',
                text: `Gotcha! ${displayName(state, 'enemy')} was caught!`
              }
            : { cue: 'breakFree', text: 'Oh no! It broke free!' }
        )
        break
      }
      case 'damage': {
        const used = steps[steps.length - 1]
        if (used && event.amount > 0) {
          used.cue = event.crit ? 'crit' : 'hit'
          used.damage = {
            amount: event.amount,
            crit: event.crit,
            side: event.target
          }
          used.hp = { side: event.target, value: event.hp }
          used.hit = event.target === 'player' ? 'enemy' : 'player'
        }
        if (event.crit) steps.push({ text: 'A critical hit!' })
        const text = effectivenessText(
          event.effectiveness,
          displayName(state, event.target)
        )
        if (text) {
          steps.push({
            at: event.target,
            cue: event.effectiveness > 1 ? 'super' : 'weak',
            text
          })
        }
        break
      }
      case 'faint':
        steps.push({
          cue: 'faint',
          faint: event.side,
          text: `${displayName(state, event.side)} fainted!`
        })
        break
      case 'levelUp':
        steps.push({
          cue: 'levelUp',
          show: { fighter: event.fighter, side: 'player' },
          text: `${event.fighter.creature.name} grew to Lv${event.fighter.level}!`
        })
        break
      case 'miss':
        steps.push({ text: 'It missed!' })
        break
      case 'move':
        steps.push({
          text: `${displayName(state, event.side)} used ${event.move.name}!`
        })
        break
      case 'switch': {
        const name = event.fighter.creature.name
        const side = event.side ?? 'player'
        const mine = side === 'player'
        let text: string
        if (mine) {
          text = event.from
            ? `Come back, ${event.from}! Go, ${name}!`
            : `Go! ${name}!`
        } else {
          text = event.from
            ? `Your friend withdrew ${event.from} and sent out ${name}!`
            : `Your friend sent out ${name}!`
        }
        steps.push({ show: { fighter: event.fighter, side }, text })
        break
      }
      case 'xp':
        steps.push({ text: `${event.name} gained ${event.amount} XP!` })
        break
    }
  }
  return steps
}
