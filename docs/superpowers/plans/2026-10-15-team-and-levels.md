# Team, Catching and Levels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A saved team of up to 6 that travels between battles (HP, levels, XP), built in the explorer and grown by
catching, with switching, critical hits and level-based stats in battle.

**Architecture:** Pure rules in `src/lib/battle/` (`stats.ts`, `catch.ts`, `engine.ts`, `script.ts`, `flow.ts`) and a
pure team model in `src/lib/team/team.ts`. A `useSyncExternalStore` hook over `localStorage` (`src/hooks/useTeam.ts`)
is the only stateful piece. The explorer gets a team bar and an "Add to team" button; the battle screen builds the
party from the saved team and saves after every turn.

**Tech Stack:** React 19, TypeScript, TanStack Query 5, Tailwind 4, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-15-team-and-levels-design.md`

## Global Constraints

- Lint is strict (`pnpm lint` = `eslint . --quiet`): perfectionist sorting (run `pnpm exec eslint . --fix` after
  writing), no `console` except debug/warn/error. Prettier: no semicolons, single quotes, no trailing commas.
- tsconfig lib has no `Array.prototype.at`; use index access.
- All randomness through an injected `rng: () => number` (0 ≤ n < 1). Tests use `scriptedRng` from
  `src/test/battle.ts`, which throws if a test consumes more numbers than it scripted.
- Stats: `stat = floor(2 × base × L / 100) + 5`, `maxHp = floor(2 × base × L / 100) + L + 10`.
- Damage: `floor(((2 × L / 5 + 2) × power × atk / def) / 50 + 2)` × roll(0.85–1) × STAB 1.5 × type × crit 1.5;
  immune 0, otherwise ≥ 1. Crit chance 1/24.
- XP: total to reach level n is `n³`; gain `floor(floor(totalStats / 4) × enemyLevel / 7)`; levels 1–100; new team
  members start at Lv5.
- Catch: rate linear 255 (total ≤ 300) → 30 (total ≥ 1,070), ×0.5 legendary, min 3;
  `a = (3·max − 2·hp)·rate / (3·max)`, `p = min(1, a / 255)`, four shake checks of `p^(1/4)`.
- Team max 6, saved under `localStorage['pokemon-explorer:team']` as `{ version: 1, members }`; `hp: null` = full.
- Wild level = round(team average) + {−2…+2}, clamped 2–100.
- Copy (exact): "A critical hit!", "Come back, X! Go, Y!", "Go! Y!", "X gained N XP!", "X grew to LvN!",
  "You threw a ball!", "The ball shook…", "Gotcha! Wild X was caught!", "Oh no! It broke free!",
  "You're out of creatures!", "Who will you send out?", "Your team is rested!", "X joined your team!".
- No commits unless the user asks (their standing preference this session); checkpoints run the checks instead.

## Review Focus

1. **Corrupt or old saved team** (bad JSON, wrong version, bad fields): the app shows an empty team and never throws.
   Test: Task 4 `parseTeam` cases.
2. **Storage blocked** (private mode, `getItem`/`setItem` throw): adding and resting still work for the session.
   Test: Task 4 hook test with throwing storage.
3. **Tab closed mid-battle**: damage taken so far is kept. Test: Task 6 "saves HP after every turn".
4. **A saved creature id no longer in the data**: the team bar shows it as missing with a remove button; battles use
   the rest of the team. Test: Task 5 team bar + Task 6 loader.
5. **Caught creature saved twice** (save runs on several renders/turns): it joins once. Test: Task 4
   `saveBattle` idempotence.

---

### Task 1: Level stats, XP and catch odds

**Files:**
- Create: `src/lib/battle/stats.ts`, `src/lib/battle/catch.ts`
- Test: `src/lib/battle/stats.test.ts`, `src/lib/battle/catch.test.ts`

**Interfaces:**
- Produces: `START_LEVEL = 5`, `MAX_LEVEL = 100`, `type Stats = { attack; defense; specialAttack; specialDefense;
  speed }`, `statAt(base, level)`, `maxHpAt(base, level)`, `statsAt(creature, level): Stats`, `xpForLevel(level)`,
  `levelForXp(xp)`, `xpGain(defeated: Pokemon, defeatedLevel)`, `xpProgress(level, xp): number` (0–1);
  `catchRate(creature)`, `captureChance(rate, hp, maxHp)`, `shakeChecks(chance, rng): 0–4`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/battle/stats.test.ts
import { describe, expect, it } from 'vitest'

import { makeCreature } from '@/test/battle'

import {
  levelForXp,
  maxHpAt,
  statAt,
  statsAt,
  xpForLevel,
  xpGain,
  xpProgress
} from './stats'

describe('stat formulas', () => {
  it('come out at base + 5 (HP base + 60) at level 50', () => {
    expect(statAt(100, 50)).toBe(105)
    expect(maxHpAt(100, 50)).toBe(160)
  })

  it('scale with level', () => {
    expect(statAt(100, 5)).toBe(15)
    expect(maxHpAt(100, 5)).toBe(25)
    expect(statsAt(makeCreature({ speed: 200 }), 100).speed).toBe(405)
  })
})

describe('XP', () => {
  it('needs n³ total XP for level n', () => {
    expect(xpForLevel(5)).toBe(125)
    expect(levelForXp(0)).toBe(1)
    expect(levelForXp(215)).toBe(5)
    expect(levelForXp(216)).toBe(6)
    expect(levelForXp(10 ** 9)).toBe(100)
  })

  it('gains a quarter of total stats × level / 7', () => {
    // Total 600 → base 150; 150 × 5 / 7 = 107.
    expect(xpGain(makeCreature(), 5)).toBe(107)
  })

  it('reports progress through the current level', () => {
    expect(xpProgress(5, 125)).toBe(0)
    expect(xpProgress(5, 170)).toBeCloseTo(45 / 91)
    expect(xpProgress(100, 10 ** 6)).toBe(1)
  })
})
```

```ts
// src/lib/battle/catch.test.ts
import { describe, expect, it } from 'vitest'

import { makeCreature, scriptedRng } from '@/test/battle'

import { captureChance, catchRate, shakeChecks } from './catch'

// makeCreature has 100 in every stat (total 600); spread a total evenly.
const withTotal = (total: number, legendary = false) =>
  makeCreature({
    attack: total / 6,
    defense: total / 6,
    hp: total / 6,
    isLegendary: legendary,
    specialAttack: total / 6,
    specialDefense: total / 6,
    speed: total / 6
  })

describe('catchRate', () => {
  it('runs from 255 for the weakest to 30 for the strongest', () => {
    expect(catchRate(withTotal(300))).toBe(255)
    expect(catchRate(withTotal(240))).toBe(255)
    expect(catchRate(withTotal(1070))).toBe(30)
    expect(catchRate(withTotal(1200))).toBe(30)
    expect(catchRate(withTotal(684))).toBe(142)
  })

  it('halves for legendaries', () => {
    expect(catchRate(withTotal(1070, true))).toBe(15)
  })
})

describe('captureChance', () => {
  it('is a third of the rate at full HP and the full rate near 0', () => {
    expect(captureChance(255, 90, 90)).toBeCloseTo(1 / 3)
    expect(captureChance(255, 0, 90)).toBe(1)
    expect(captureChance(30, 0, 90)).toBeCloseTo(30 / 255)
  })
})

describe('shakeChecks', () => {
  it('counts passed checks out of four', () => {
    expect(shakeChecks(1, scriptedRng(0.99, 0.99, 0.99, 0.99))).toBe(4)
    expect(shakeChecks(0, scriptedRng(0))).toBe(0)
    // p = 1/16 → each check passes at 0.5.
    expect(shakeChecks(1 / 16, scriptedRng(0.4, 0.4, 0.6))).toBe(2)
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run src/lib/battle/stats.test.ts src/lib/battle/catch.test.ts`
Expected: FAIL, "Failed to resolve import './stats'" / "'./catch'".

- [ ] **Step 3: Implement**

```ts
// src/lib/battle/stats.ts
import { type Pokemon, totalStats } from '../pokemon'

export const START_LEVEL = 5
export const MAX_LEVEL = 100

export type Stats = {
  attack: number
  defense: number
  specialAttack: number
  specialDefense: number
  speed: number
}

// The games' stat formulas without IVs, EVs or natures. At level 50 a stat is
// base + 5 and HP is base + 60, so level-50 battles match the old rules.
export const statAt = (base: number, level: number) =>
  Math.floor((2 * base * level) / 100) + 5

export const maxHpAt = (base: number, level: number) =>
  Math.floor((2 * base * level) / 100) + level + 10

export function statsAt(creature: Pokemon, level: number): Stats {
  return {
    attack: statAt(creature.attack, level),
    defense: statAt(creature.defense, level),
    specialAttack: statAt(creature.specialAttack, level),
    specialDefense: statAt(creature.specialDefense, level),
    speed: statAt(creature.speed, level)
  }
}

// Medium-fast growth: level n needs n³ total XP.
export const xpForLevel = (level: number) => level ** 3

export function levelForXp(xp: number) {
  let level = 1
  while (level < MAX_LEVEL && xpForLevel(level + 1) <= xp) level++
  return level
}

// The games scale a species' base XP by the defeated level and divide by 7.
// The data has no base XP, so a quarter of the total base stats stands in.
export function xpGain(defeated: Pokemon, defeatedLevel: number) {
  return Math.floor((Math.floor(totalStats(defeated) / 4) * defeatedLevel) / 7)
}

// 0–1 through the current level, for the XP bar.
export function xpProgress(level: number, xp: number) {
  if (level >= MAX_LEVEL) return 1
  const start = xpForLevel(level)
  const span = xpForLevel(level + 1) - start
  return Math.min(1, Math.max(0, (xp - start) / span))
}
```

```ts
// src/lib/battle/catch.ts
import type { Rng } from './engine'

import { type Pokemon, totalStats } from '../pokemon'

const WEAKEST = 300
const STRONGEST = 1070
const EASIEST = 255
const HARDEST = 30
const MIN_RATE = 3

// The data has no per-species catch rate, so stronger creatures are harder to
// catch, loosely like the games (255 for the commonest, 3 for legendaries).
export function catchRate(creature: Pokemon) {
  const total = Math.min(STRONGEST, Math.max(WEAKEST, totalStats(creature)))
  const rate =
    EASIEST -
    ((total - WEAKEST) * (EASIEST - HARDEST)) / (STRONGEST - WEAKEST)
  return Math.max(MIN_RATE, Math.floor(creature.isLegendary ? rate / 2 : rate))
}

// Gen III+: a = (3·max − 2·hp) · rate / (3·max), caught with chance a / 255.
export function captureChance(rate: number, hp: number, maxHp: number) {
  return Math.min(1, ((3 * maxHp - 2 * hp) * rate) / (3 * maxHp) / 255)
}

// Four shake checks that all pass with chance `chance`. Returns how many
// passed (4 = caught); the count drives "The ball shook…" messages.
export function shakeChecks(chance: number, rng: Rng) {
  const perShake = chance ** 0.25
  let passed = 0
  while (passed < 4 && rng() < perShake) passed++
  return passed
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm exec vitest run src/lib/battle/stats.test.ts src/lib/battle/catch.test.ts`
Expected: PASS.

- [ ] **Step 5: Checkpoint** — `pnpm exec eslint src/lib/battle --fix && pnpm exec tsc -b`

---

### Task 2: Engine with levels, crits, a party, switching, catching and XP

**Files:**
- Modify: `src/lib/battle/engine.ts` (rewrite), `src/test/battle.ts` (add `makeFighter`)
- Test: `src/lib/battle/engine.test.ts` (rewrite the damage, AI and turn sections; keep `movesFor` tests)

**Interfaces:**
- Consumes: Task 1 exports; `movesFor`, `moveCategory` (`moves.ts`); `effectiveness` (`type-chart.ts`).
- Produces:
  - `type Fighter = { creature; hp; level; maxHp; moves; stats: Stats; uid: string; xp: number }`
  - `type BattleState = { active: number; caught: boolean; enemy: Fighter; mustSwitch: boolean; party: Fighter[];
    winner: null | Side }`
  - `type PlayerAction = { index; type: 'move' } | { to; type: 'switch' } | { type: 'catch' }`
  - `type BattleEvent` = `damage {amount, crit, effectiveness, hp, target}` | `switch {fighter, from: null|string}` |
    `levelUp {fighter}` | `xp {amount, name}` | `move {move, side}` | `catch {shakes}` | `faint {side}` |
    `miss {side}` | `blackout`
  - `MAX_TEAM = 6`, `CRIT_CHANCE`, `createFighter(creature, level, { hp?, uid, xp? })`,
    `createBattle(party, enemy)`, `activeFighter(state)`, `wildLevel(levels, rng)`,
    `baseDamage(level, power, atk, def)`, `calcDamage({ attacker, crit?, defender, move, roll })`,
    `chooseEnemyMove(enemy, target, rng)`, `turnOrder` (unchanged), `resolveTurn(state, action, rng)`,
    `sendOut(state, to)` → `{ events, state }`.
  - RNG order per attack: hit check, crit check, damage roll. Per move turn: enemy AI first, then speed tie.

- [ ] **Step 1: Add the fighter helper**

```ts
// append to src/test/battle.ts (and import createFighter, type Fighter from '@/lib/battle/engine')
export function makeFighter(
  overrides: Partial<Pokemon> = {},
  level = 50,
  extra: { hp?: number; uid?: string; xp?: number } = {}
): Fighter {
  return createFighter(makeCreature(overrides), level, {
    hp: extra.hp,
    uid: extra.uid ?? `uid-${overrides.id ?? 1}`,
    xp: extra.xp
  })
}
```

- [ ] **Step 2: Write the failing tests** (replace everything above `describe('movesFor'` in `engine.test.ts`)

```ts
import { describe, expect, it } from 'vitest'

import { makeFighter, scriptedRng } from '@/test/battle'

import {
  activeFighter,
  baseDamage,
  calcDamage,
  chooseEnemyMove,
  createBattle,
  MAX_TEAM,
  resolveTurn,
  sendOut,
  turnOrder,
  wildLevel
} from './engine'
import { type Move, moveCategory, movesFor } from './moves'

const move = (type: Move['type'], power: number, accuracy = 100): Move => ({
  accuracy,
  name: `${type} ${power}`,
  power,
  type
})

// Crit check value that never crits (1/24 ≈ 0.042).
const NO_CRIT = 0.5

describe('baseDamage', () => {
  it('uses the attacker level in the level term', () => {
    expect(baseDamage(50, 60, 100, 100)).toBe(28)
    expect(baseDamage(5, 60, 15, 15)).toBe(6)
  })
})

describe('calcDamage', () => {
  it('uses levelled stats, STAB and type', () => {
    const fire = makeFighter({ specialAttack: 120, types: ['Fire'] })
    const grass = makeFighter({ specialDefense: 80, types: ['Grass'] })
    // spA 125 vs spD 85 → base 57; × 1.5 STAB × 2.
    const hit = { attacker: fire, defender: grass, move: move('Fire', 85) }
    expect(calcDamage({ ...hit, roll: 1 })).toEqual({ damage: 171, effectiveness: 2 })
    expect(calcDamage({ ...hit, roll: 0.85 }).damage).toBe(145)
    expect(calcDamage({ ...hit, crit: true, roll: 1 }).damage).toBe(256)
  })

  it('makes level matter', () => {
    const strong = makeFighter({ types: ['Water'] }, 50)
    const weak = makeFighter({ types: ['Water'] }, 5)
    const tackle = move('Normal', 60)
    expect(calcDamage({ attacker: weak, defender: weak, move: tackle, roll: 1 }).damage).toBe(6)
    expect(calcDamage({ attacker: strong, defender: weak, move: tackle, roll: 1 }).damage).toBe(186)
  })

  it('uses attack/defense for physical types and the special pair otherwise', () => {
    const attacker = makeFighter({ attack: 200, specialAttack: 10, types: ['Water'] })
    const defender = makeFighter({ defense: 50, specialDefense: 200 })
    expect(calcDamage({ attacker, defender, move: move('Rock', 50), roll: 1 }).damage).toBe(
      baseDamage(50, 50, 205, 55)
    )
    expect(calcDamage({ attacker, defender, move: move('Ice', 50), roll: 1 }).damage).toBe(
      baseDamage(50, 50, 15, 205)
    )
  })

  it('splits categories as the rules list them', () => {
    for (const type of ['Normal', 'Fighting', 'Ground', 'Rock', 'Bug', 'Ghost', 'Steel', 'Poison'] as const) {
      expect(moveCategory(type)).toBe('physical')
    }
    for (const type of ['Fire', 'Water', 'Grass', 'Electric', 'Ice', 'Psychic', 'Dragon', 'Dark', 'Fairy', 'Flying'] as const) {
      expect(moveCategory(type)).toBe('special')
    }
  })

  it('does 0 to an immune target and at least 1 otherwise', () => {
    const ghost = makeFighter({ types: ['Ghost'] })
    expect(calcDamage({ attacker: makeFighter(), defender: ghost, move: move('Normal', 90), roll: 1 }))
      .toEqual({ damage: 0, effectiveness: 0 })
    const weak = makeFighter({ specialAttack: 10 }, 5)
    const wall = makeFighter({ specialDefense: 230, types: ['Water', 'Dragon'] })
    expect(calcDamage({ attacker: weak, defender: wall, move: move('Fire', 45), roll: 0.85 }))
      .toEqual({ damage: 1, effectiveness: 0.25 })
  })
})

describe('turnOrder', () => {
  it('lets the faster creature go first without using the rng', () => {
    const rng = scriptedRng()
    expect(turnOrder(120, 80, rng)).toEqual(['player', 'enemy'])
    expect(turnOrder(30, 31, rng)).toEqual(['enemy', 'player'])
  })

  it('breaks a speed tie at random', () => {
    expect(turnOrder(90, 90, scriptedRng(0.2))).toEqual(['player', 'enemy'])
    expect(turnOrder(90, 90, scriptedRng(0.7))).toEqual(['enemy', 'player'])
  })
})

describe('chooseEnemyMove', () => {
  it('picks the highest expected damage 70% of the time', () => {
    expect(chooseEnemyMove(makeFighter(), makeFighter(), scriptedRng(0.69))).toBe(3)
  })

  it('accounts for type matchups', () => {
    const enemy = makeFighter({ types: ['Fighting', 'Electric'] })
    expect(chooseEnemyMove(enemy, makeFighter({ types: ['Ghost'] }), scriptedRng(0))).toBe(2)
  })

  it('otherwise picks any move at random', () => {
    expect(chooseEnemyMove(makeFighter(), makeFighter(), scriptedRng(0.7, 0.5))).toBe(2)
  })
})

describe('wildLevel', () => {
  it('is the team average ±2, clamped to 2–100', () => {
    expect(wildLevel([10, 20], scriptedRng(0))).toBe(13)
    expect(wildLevel([10, 20], scriptedRng(0.99))).toBe(17)
    expect(wildLevel([1], scriptedRng(0))).toBe(2)
    expect(wildLevel([100], scriptedRng(0.99))).toBe(100)
  })
})

describe('resolveTurn', () => {
  const fast = () => makeFighter({ id: 1, name: 'Fast', speed: 120 }, 50, { uid: 'a' })
  const slow = () => makeFighter({ id: 2, name: 'Slow', speed: 80 }, 50, { uid: 'w' })
  const battleOf = (party = [fast()], enemy = slow()) => createBattle(party, enemy)

  it('runs both attacks in speed order', () => {
    const battle = battleOf()
    // AI pick; player hit, crit check, roll; enemy hit, crit check, roll.
    const { events, state } = resolveTurn(
      battle,
      { index: 1, type: 'move' },
      scriptedRng(0, 0, NO_CRIT, 0, 0, NO_CRIT, 0)
    )
    expect(events).toEqual([
      { move: battle.party[0].moves[1], side: 'player', type: 'move' },
      { amount: 35, crit: false, effectiveness: 1, hp: 125, target: 'enemy', type: 'damage' },
      { move: battle.enemy.moves[3], side: 'enemy', type: 'move' },
      { amount: 52, crit: false, effectiveness: 1, hp: 108, target: 'player', type: 'damage' }
    ])
    expect(battle.enemy.hp).toBe(160)
  })

  it('records critical hits', () => {
    const { events } = resolveTurn(
      battleOf(),
      { index: 1, type: 'move' },
      scriptedRng(0, 0, 0, 0, 0, NO_CRIT, 0)
    )
    // 28 × 0.85 × 1.5 × 1.5 = 53.
    expect(events[1]).toMatchObject({ amount: 53, crit: true })
  })

  it('records a miss', () => {
    const { events, state } = resolveTurn(
      battleOf(),
      { index: 1, type: 'move' },
      scriptedRng(0, 0.99, 0, NO_CRIT, 0)
    )
    expect(events[1]).toEqual({ side: 'player', type: 'miss' })
    expect(state.enemy.hp).toBe(160)
  })

  it('wins and gives XP when the wild creature faints', () => {
    const battle = battleOf()
    battle.enemy.hp = 10
    const { events, state } = resolveTurn(
      battle,
      { index: 0, type: 'move' },
      scriptedRng(0, 0, NO_CRIT, 0)
    )
    expect(events.slice(-2)).toEqual([
      { side: 'enemy', type: 'faint' },
      { amount: 1071, name: 'Fast', type: 'xp' }
    ])
    expect(state.winner).toBe('player')
    expect(activeFighter(state).xp).toBe(125_000 + 1071)
    expect(resolveTurn(state, { index: 0, type: 'move' }, scriptedRng())).toEqual({ events: [], state })
  })

  it('levels up, raising max HP and current HP together', () => {
    const rookie = makeFighter({ id: 1, name: 'Rookie', speed: 200 }, 5, { uid: 'r' })
    const battle = battleOf([rookie])
    battle.enemy.hp = 1
    const { events, state } = resolveTurn(
      battle,
      { index: 0, type: 'move' },
      scriptedRng(0, 0, NO_CRIT, 0)
    )
    // 125 + 1071 XP → Lv10 (1000 ≤ 1196 < 1331); max HP 25 → 40.
    expect(events[events.length - 1]).toMatchObject({
      fighter: { hp: 40, level: 10, maxHp: 40 },
      type: 'levelUp'
    })
    expect(activeFighter(state)).toMatchObject({ level: 10, maxHp: 40 })
  })

  it('asks for a switch when the active creature faints and another can fight', () => {
    const weak = makeFighter({ id: 1, name: 'Weak', speed: 10 }, 50, { hp: 1, uid: 'a' })
    const backup = makeFighter({ id: 3, name: 'Backup' }, 50, { uid: 'b' })
    const { events, state } = resolveTurn(
      battleOf([weak, backup]),
      { index: 0, type: 'move' },
      scriptedRng(0, 0, NO_CRIT, 0)
    )
    expect(events[events.length - 1]).toEqual({ side: 'player', type: 'faint' })
    expect(state).toMatchObject({ mustSwitch: true, winner: null })
    expect(resolveTurn(state, { index: 0, type: 'move' }, scriptedRng()).events).toEqual([])

    const sent = sendOut(state, 1)
    expect(sent.events).toEqual([
      { fighter: sent.state.party[1], from: null, type: 'switch' }
    ])
    expect(sent.state).toMatchObject({ active: 1, mustSwitch: false })
  })

  it('loses only when the whole team has fainted', () => {
    const weak = makeFighter({ id: 1, speed: 10 }, 50, { hp: 1, uid: 'a' })
    const { events, state } = resolveTurn(
      battleOf([weak]),
      { index: 0, type: 'move' },
      scriptedRng(0, 0, NO_CRIT, 0)
    )
    expect(events.slice(-2)).toEqual([
      { side: 'player', type: 'faint' },
      { type: 'blackout' }
    ])
    expect(state.winner).toBe('enemy')
  })

  it('switches before the enemy attacks the new creature', () => {
    const battle = battleOf([fast(), makeFighter({ id: 3, name: 'Second' }, 50, { uid: 'b' })])
    const { events, state } = resolveTurn(
      battle,
      { to: 1, type: 'switch' },
      scriptedRng(0, 0, NO_CRIT, 0)
    )
    expect(events[0]).toMatchObject({ from: 'Fast', type: 'switch' })
    expect(events[2]).toMatchObject({ target: 'player', type: 'damage' })
    expect(state.active).toBe(1)
    expect(state.party[1].hp).toBeLessThan(160)
    expect(state.party[0].hp).toBe(160)
  })

  it('catches when all four shakes pass, with no enemy attack', () => {
    const { events, state } = resolveTurn(battleOf(), { type: 'catch' }, scriptedRng(0, 0, 0, 0))
    expect(events[0]).toEqual({ shakes: 4, type: 'catch' })
    expect(state).toMatchObject({ caught: true, winner: 'player' })
  })

  it('lets the enemy attack after a failed throw', () => {
    const { events, state } = resolveTurn(
      battleOf(),
      { type: 'catch' },
      scriptedRng(0.99, 0, 0, NO_CRIT, 0)
    )
    expect(events[0]).toEqual({ shakes: 0, type: 'catch' })
    expect(events[1]).toMatchObject({ side: 'enemy', type: 'move' })
    expect(state.caught).toBe(false)
  })

  it('refuses to catch with a full team', () => {
    const party = Array.from({ length: MAX_TEAM }, (_, i) =>
      makeFighter({ id: i + 1 }, 50, { uid: `m${i}` })
    )
    expect(() => resolveTurn(battleOf(party), { type: 'catch' }, scriptedRng(0))).toThrow()
  })
})
```

- [ ] **Step 3: Run to see it fail**

Run: `pnpm exec vitest run src/lib/battle/engine.test.ts`
Expected: FAIL (missing exports `activeFighter`, `sendOut`, `wildLevel`, `MAX_TEAM`; signature mismatches).

- [ ] **Step 4: Rewrite `src/lib/battle/engine.ts`**

```ts
import type { Pokemon } from '../pokemon'

import { captureChance, catchRate, shakeChecks } from './catch'
import { type Move, moveCategory, movesFor } from './moves'
import {
  levelForXp,
  MAX_LEVEL,
  maxHpAt,
  START_LEVEL,
  type Stats,
  statsAt,
  xpForLevel,
  xpGain
} from './stats'
import { effectiveness } from './type-chart'

// Pure battle rules: no React, no timers. Every random choice goes through an
// injected `rng` (0 ≤ n < 1) so tests can script it.
export type Rng = () => number

export type Side = 'enemy' | 'player'

export type Fighter = {
  creature: Pokemon
  hp: number
  level: number
  maxHp: number
  moves: Move[]
  stats: Stats
  // Ties the fighter back to its saved team member (or a fresh wild id).
  uid: string
  xp: number
}

export type BattleState = {
  // Index into `party` of the creature on the field.
  active: number
  caught: boolean
  enemy: Fighter
  // The active creature fainted and another must be sent out.
  mustSwitch: boolean
  party: Fighter[]
  winner: null | Side
}

export type PlayerAction =
  | { index: number; type: 'move' }
  | { to: number; type: 'switch' }
  | { type: 'catch' }

export type BattleEvent =
  | {
      amount: number
      crit: boolean
      effectiveness: number
      hp: number
      target: Side
      type: 'damage'
    }
  | { amount: number; name: string; type: 'xp' }
  | { fighter: Fighter; from: null | string; type: 'switch' }
  | { fighter: Fighter; type: 'levelUp' }
  | { move: Move; side: Side; type: 'move' }
  | { shakes: number; type: 'catch' }
  | { side: Side; type: 'faint' }
  | { side: Side; type: 'miss' }
  | { type: 'blackout' }

type Combatant = Pick<Fighter, 'creature' | 'level' | 'stats'>

type DamageInput = {
  attacker: Combatant
  crit?: boolean
  defender: Combatant
  move: Move
  // Random factor, MIN_ROLL to 1.
  roll: number
}

type TurnResult = { events: BattleEvent[]; state: BattleState }

export const MAX_TEAM = 6
export const MIN_ROLL = 0.85
export const ENEMY_BEST_MOVE_CHANCE = 0.7
export const CRIT_CHANCE = 1 / 24
const CRIT_MULTIPLIER = 1.5
const STAB = 1.5
const WILD_LEVEL_SPREAD = 2
const MIN_WILD_LEVEL = 2

export const opponentOf = (side: Side): Side =>
  side === 'player' ? 'enemy' : 'player'

export const activeFighter = (state: BattleState) => state.party[state.active]

export function createFighter(
  creature: Pokemon,
  level: number,
  { hp, uid, xp }: { hp?: null | number; uid: string; xp?: number }
): Fighter {
  const maxHp = maxHpAt(creature.hp, level)
  return {
    creature,
    hp: hp == null ? maxHp : Math.min(maxHp, Math.max(0, hp)),
    level,
    maxHp,
    moves: movesFor(creature),
    stats: statsAt(creature, level),
    uid,
    xp: Math.max(xp ?? 0, xpForLevel(level))
  }
}

export function createBattle(party: Fighter[], enemy: Fighter): BattleState {
  const active = party.findIndex(fighter => fighter.hp > 0)
  if (active < 0) throw new Error('Every team member has fainted')
  return { active, caught: false, enemy, mustSwitch: false, party, winner: null }
}

// Round(team average) ± 2: the app has no map, so wild levels follow the team.
export function wildLevel(levels: number[], rng: Rng) {
  const average =
    levels.length === 0
      ? START_LEVEL
      : Math.round(levels.reduce((sum, level) => sum + level, 0) / levels.length)
  const offset =
    Math.floor(rng() * (2 * WILD_LEVEL_SPREAD + 1)) - WILD_LEVEL_SPREAD
  return Math.min(MAX_LEVEL, Math.max(MIN_WILD_LEVEL, average + offset))
}

export function baseDamage(
  level: number,
  power: number,
  attack: number,
  defense: number
) {
  return Math.floor((((2 * level) / 5 + 2) * power * attack) / defense / 50 + 2)
}

export function calcDamage({
  attacker,
  crit = false,
  defender,
  move,
  roll
}: DamageInput) {
  const physical = moveCategory(move.type) === 'physical'
  const attack = physical ? attacker.stats.attack : attacker.stats.specialAttack
  const defense = physical
    ? defender.stats.defense
    : defender.stats.specialDefense
  const stab = attacker.creature.types.includes(move.type) ? STAB : 1
  const multiplier = effectiveness(move.type, defender.creature.types)
  const raw = Math.floor(
    baseDamage(attacker.level, move.power, attack, defense) *
      roll *
      stab *
      (crit ? CRIT_MULTIPLIER : 1) *
      multiplier
  )
  // A hit that isn't immune always does something; flooring a resisted
  // weak hit could otherwise round it to 0.
  const damage = multiplier === 0 ? 0 : Math.max(1, raw)
  return { damage, effectiveness: multiplier }
}

// Faster side first; a speed tie is a coin flip.
export function turnOrder(
  playerSpeed: number,
  enemySpeed: number,
  rng: Rng
): [Side, Side] {
  const playerFirst =
    playerSpeed === enemySpeed ? rng() < 0.5 : playerSpeed > enemySpeed
  return playerFirst ? ['player', 'enemy'] : ['enemy', 'player']
}

export const rollFrom = (rng: Rng) => MIN_ROLL + rng() * (1 - MIN_ROLL)

export const hits = (move: Move, rng: Rng) => rng() * 100 < move.accuracy

// Average damage including the chance to miss (crits ignored).
export function expectedDamage(
  attacker: Combatant,
  defender: Combatant,
  move: Move
) {
  const { damage } = calcDamage({
    attacker,
    defender,
    move,
    roll: (MIN_ROLL + 1) / 2
  })
  return (damage * move.accuracy) / 100
}

// 70% of the time the best move by expected damage, otherwise any move.
export function chooseEnemyMove(
  enemy: Fighter,
  target: Combatant,
  rng: Rng
): number {
  if (rng() < ENEMY_BEST_MOVE_CHANCE) {
    let best = 0
    let bestDamage = -1
    enemy.moves.forEach((move, index) => {
      const value = expectedDamage(enemy, target, move)
      if (value > bestDamage) {
        best = index
        bestDamage = value
      }
    })
    return best
  }
  return Math.min(
    Math.floor(rng() * enemy.moves.length),
    enemy.moves.length - 1
  )
}

// One turn. Switching and throwing happen before any move (as in the games);
// then the enemy acts. A move turn runs both moves in speed order. The turn
// stops when someone faints.
export function resolveTurn(
  state: BattleState,
  action: PlayerAction,
  rng: Rng
): TurnResult {
  if (state.winner || state.mustSwitch) return { events: [], state }
  const next = draft(state)
  const events: BattleEvent[] = []

  if (action.type === 'move') {
    const enemyMove = chooseEnemyMove(next.enemy, activeFighter(next), rng)
    const order = turnOrder(
      activeFighter(next).stats.speed,
      next.enemy.stats.speed,
      rng
    )
    for (const side of order) {
      attack(next, side, side === 'player' ? action.index : enemyMove, rng, events)
      if (next.winner || next.mustSwitch) break
    }
  } else {
    if (action.type === 'switch') switchTo(next, action.to, events)
    else throwBall(next, rng, events)
    if (!next.winner) {
      const enemyMove = chooseEnemyMove(next.enemy, activeFighter(next), rng)
      attack(next, 'enemy', enemyMove, rng, events)
    }
  }

  return { events, state: next }
}

// After a faint: send out another creature. Free, so the enemy doesn't act.
export function sendOut(state: BattleState, to: number): TurnResult {
  if (!state.mustSwitch) return { events: [], state }
  const next = draft(state)
  const events: BattleEvent[] = []
  switchTo(next, to, events)
  return { events, state: next }
}

// Copies everything resolveTurn mutates, so the input state is untouched.
function draft(state: BattleState): BattleState {
  return {
    ...state,
    enemy: { ...state.enemy },
    party: state.party.map(fighter => ({ ...fighter }))
  }
}

function attack(
  state: BattleState,
  side: Side,
  moveIndex: number,
  rng: Rng,
  events: BattleEvent[]
) {
  const target = opponentOf(side)
  const attacker = side === 'player' ? activeFighter(state) : state.enemy
  const defender = target === 'player' ? activeFighter(state) : state.enemy
  const move = attacker.moves[moveIndex]
  if (!move) throw new Error(`No move ${moveIndex} for ${side}`)

  events.push({ move, side, type: 'move' })
  if (!hits(move, rng)) {
    events.push({ side, type: 'miss' })
    return
  }
  const crit = rng() < CRIT_CHANCE
  const { damage, effectiveness } = calcDamage({
    attacker,
    crit,
    defender,
    move,
    roll: rollFrom(rng)
  })
  defender.hp = Math.max(0, defender.hp - damage)
  events.push({
    amount: damage,
    crit: crit && damage > 0,
    effectiveness,
    hp: defender.hp,
    target,
    type: 'damage'
  })
  if (defender.hp === 0) faint(state, target, events)
}

function faint(state: BattleState, side: Side, events: BattleEvent[]) {
  events.push({ side, type: 'faint' })
  if (side === 'enemy') {
    state.winner = 'player'
    awardXp(state, events)
  } else if (state.party.some(fighter => fighter.hp > 0)) {
    state.mustSwitch = true
  } else {
    state.winner = 'enemy'
    events.push({ type: 'blackout' })
  }
}

function switchTo(state: BattleState, to: number, events: BattleEvent[]) {
  const incoming = state.party[to]
  if (!incoming || to === state.active || incoming.hp === 0) {
    throw new Error(`Can't switch to ${to}`)
  }
  const from = state.mustSwitch ? null : activeFighter(state).creature.name
  state.active = to
  state.mustSwitch = false
  events.push({ fighter: { ...incoming }, from, type: 'switch' })
}

function throwBall(state: BattleState, rng: Rng, events: BattleEvent[]) {
  if (state.party.length >= MAX_TEAM) throw new Error('The team is full')
  const { enemy } = state
  const chance = captureChance(catchRate(enemy.creature), enemy.hp, enemy.maxHp)
  const shakes = shakeChecks(chance, rng)
  events.push({ shakes, type: 'catch' })
  if (shakes === 4) {
    state.caught = true
    state.winner = 'player'
    awardXp(state, events)
  }
}

// Defeating or catching gives XP to the creature on the field. Leveling
// raises max HP, and current HP rises by the same amount.
function awardXp(state: BattleState, events: BattleEvent[]) {
  const fighter = activeFighter(state)
  if (fighter.level >= MAX_LEVEL) return
  const amount = xpGain(state.enemy.creature, state.enemy.level)
  fighter.xp += amount
  events.push({ amount, name: fighter.creature.name, type: 'xp' })
  const level = levelForXp(fighter.xp)
  if (level <= fighter.level) return
  const maxHp = maxHpAt(fighter.creature.hp, level)
  fighter.hp += maxHp - fighter.maxHp
  fighter.level = level
  fighter.maxHp = maxHp
  fighter.stats = statsAt(fighter.creature, level)
  events.push({ fighter: { ...fighter }, type: 'levelUp' })
}
```

- [ ] **Step 5: Run the engine tests to see them pass**

Run: `pnpm exec vitest run src/lib/battle/engine.test.ts`
Expected: PASS. (`script.test.ts`, `flow` and the UI fail until Tasks 3 and 6; that's expected.)

- [ ] **Step 6: Checkpoint** — `pnpm exec eslint src/lib/battle src/test --fix`

---

### Task 3: Messages and the screen state machine

**Files:**
- Modify: `src/lib/battle/script.ts`, `src/lib/battle/flow.ts`
- Test: `src/lib/battle/script.test.ts` (rewrite), `src/lib/battle/flow.test.ts` (new)

**Interfaces:**
- Consumes: Task 2 types, `activeFighter`.
- Produces:
  - `Step = { faint?: Side; hit?: Side; hp?: { side; value }; show?: { fighter: Fighter; side: Side }; text }`
  - `stepsFor(state, events)`, `introSteps(state)`, `effectivenessText`, `displayName(state, side)`
  - `Phase = 'end' | 'menu' | 'messages' | 'moves' | 'switch' | 'team'`, `Outcome = 'caught' | 'lost' | 'ran' |
    'won'`
  - `FlowState` gains `shown: Record<Side, Fighter>`; `after: 'end' | 'menu' | 'switch'`
  - `FlowAction = { events; state; type: 'resolved' } | { type: 'advance' } | { type: 'back' } | { type: 'fight' } |
    { type: 'run' } | { type: 'team' }`
  - `startFlow(battle)`, `flowReducer`, `currentStep`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/battle/script.test.ts
import { describe, expect, it } from 'vitest'

import { makeFighter } from '@/test/battle'

import { type BattleEvent, createBattle } from './engine'
import { effectivenessText, introSteps, stepsFor } from './script'

const sparky = makeFighter({ name: 'Sparky', types: ['Electric'] }, 5, { uid: 'p' })
const puddle = makeFighter({ id: 2, name: 'Puddle', types: ['Water'] }, 4, { uid: 'w' })
const battle = createBattle([sparky], puddle)

describe('introSteps', () => {
  it('announces the wild creature, then sends out the player', () => {
    expect(introSteps(battle).map(s => s.text)).toEqual(['A wild Puddle appeared!', 'Go! Sparky!'])
  })
})

describe('effectivenessText', () => {
  it('has a line for every multiplier except 1x', () => {
    expect(effectivenessText(4, 'X')).toBe("It's super effective!")
    expect(effectivenessText(1, 'X')).toBeNull()
    expect(effectivenessText(0.25, 'X')).toBe("It's not very effective…")
    expect(effectivenessText(0, 'Wild X')).toBe("It doesn't affect Wild X…")
  })
})

describe('stepsFor', () => {
  const steps = (events: BattleEvent[]) => stepsFor(battle, events)

  it('attaches damage to the "used" line, then crit and effectiveness lines', () => {
    expect(
      steps([
        { move: sparky.moves[0], side: 'player', type: 'move' },
        { amount: 9, crit: true, effectiveness: 2, hp: 10, target: 'enemy', type: 'damage' }
      ])
    ).toEqual([
      { hit: 'player', hp: { side: 'enemy', value: 10 }, text: 'Sparky used Static Snap!' },
      { text: 'A critical hit!' },
      { text: "It's super effective!" }
    ])
  })

  it('describes switching, XP and level-ups, showing the new fighter', () => {
    const grown = { ...sparky, hp: 30, level: 6 }
    expect(
      steps([
        { fighter: sparky, from: 'Old', type: 'switch' },
        { fighter: sparky, from: null, type: 'switch' },
        { amount: 42, name: 'Sparky', type: 'xp' },
        { fighter: grown, type: 'levelUp' }
      ])
    ).toEqual([
      { show: { fighter: sparky, side: 'player' }, text: 'Come back, Old! Go, Sparky!' },
      { show: { fighter: sparky, side: 'player' }, text: 'Go! Sparky!' },
      { text: 'Sparky gained 42 XP!' },
      { show: { fighter: grown, side: 'player' }, text: 'Sparky grew to Lv6!' }
    ])
  })

  it('shakes up to three times, then catches or breaks free', () => {
    expect(steps([{ shakes: 4, type: 'catch' }]).map(s => s.text)).toEqual([
      'You threw a ball!',
      'The ball shook…',
      'The ball shook…',
      'The ball shook…',
      'Gotcha! Wild Puddle was caught!'
    ])
    expect(steps([{ shakes: 4, type: 'catch' }]).pop()).toMatchObject({ faint: 'enemy' })
    expect(steps([{ shakes: 1, type: 'catch' }]).map(s => s.text)).toEqual([
      'You threw a ball!',
      'The ball shook…',
      'Oh no! It broke free!'
    ])
  })

  it('ends with faint and blackout lines', () => {
    expect(steps([{ side: 'player', type: 'faint' }, { type: 'blackout' }])).toEqual([
      { faint: 'player', text: 'Sparky fainted!' },
      { text: "You're out of creatures!" }
    ])
  })
})
```

```ts
// src/lib/battle/flow.test.ts
import { describe, expect, it } from 'vitest'

import { makeFighter, scriptedRng } from '@/test/battle'

import { createBattle, resolveTurn, sendOut } from './engine'
import { currentStep, flowReducer, startFlow } from './flow'

const NO_CRIT = 0.5

function readAll(state: ReturnType<typeof startFlow>) {
  let next = state
  while (next.phase === 'messages') next = flowReducer(next, { type: 'advance' })
  return next
}

describe('flowReducer', () => {
  it('opens the team list and goes back to the menu', () => {
    const flow = readAll(startFlow(createBattle([makeFighter()], makeFighter({ id: 2 }, 50, { uid: 'w' }))))
    expect(flow.phase).toBe('menu')
    const team = flowReducer(flow, { type: 'team' })
    expect(team.phase).toBe('team')
    expect(flowReducer(team, { type: 'back' }).phase).toBe('menu')
  })

  it('goes to the forced switch after a faint, then shows the new creature', () => {
    const weak = makeFighter({ name: 'Weak', speed: 1 }, 50, { hp: 1, uid: 'a' })
    const backup = makeFighter({ id: 3, name: 'Backup' }, 50, { uid: 'b' })
    let flow = readAll(startFlow(createBattle([weak, backup], makeFighter({ id: 2 }, 50, { uid: 'w' }))))
    flow = flowReducer(flow, { type: 'fight' })
    const turn = resolveTurn(flow.battle, { index: 0, type: 'move' }, scriptedRng(0, 0, NO_CRIT, 0))
    flow = readAll(flowReducer(flow, { type: 'resolved', ...turn }))
    expect(flow.phase).toBe('switch')
    expect(flow.fainted.player).toBe(true)

    flow = flowReducer(flow, { type: 'resolved', ...sendOut(flow.battle, 1) })
    expect(currentStep(flow)?.text).toBe('Go! Backup!')
    expect(flow.shown.player.uid).toBe('b')
    expect(flow.fainted.player).toBe(false)
    expect(readAll(flow).phase).toBe('menu')
  })

  it('ends as caught after a successful throw', () => {
    let flow = readAll(startFlow(createBattle([makeFighter()], makeFighter({ id: 2 }, 50, { uid: 'w' }))))
    flow = flowReducer(flow, { type: 'resolved', ...resolveTurn(flow.battle, { type: 'catch' }, scriptedRng(0, 0, 0, 0)) })
    flow = readAll(flow)
    expect(flow).toMatchObject({ outcome: 'caught', phase: 'end' })
  })
})
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm exec vitest run src/lib/battle/script.test.ts src/lib/battle/flow.test.ts`
Expected: FAIL (`stepsFor` doesn't know the new events; `flowReducer` has no `team`/`resolved`).

- [ ] **Step 3: Replace `src/lib/battle/script.ts`**

```ts
import {
  activeFighter,
  type BattleEvent,
  type BattleState,
  type Fighter,
  type Side
} from './engine'

// One message in the dialog box, plus what the scene should do when it shows.
export type Step = {
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

// Names repeat across creatures, so the wild one is always "Wild X".
export function displayName(state: BattleState, side: Side) {
  return side === 'enemy'
    ? `Wild ${state.enemy.creature.name}`
    : activeFighter(state).creature.name
}

export function effectivenessText(multiplier: number, target: string) {
  if (multiplier === 0) return `It doesn't affect ${target}…`
  if (multiplier > 1) return "It's super effective!"
  if (multiplier < 1) return "It's not very effective…"
  return null
}

export function introSteps(state: BattleState): Step[] {
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
        steps.push({ text: 'You threw a ball!' })
        for (let i = 0; i < Math.min(event.shakes, VISIBLE_SHAKES); i++) {
          steps.push({ text: 'The ball shook…' })
        }
        steps.push(
          event.shakes === 4
            ? {
                faint: 'enemy',
                text: `Gotcha! ${displayName(state, 'enemy')} was caught!`
              }
            : { text: 'Oh no! It broke free!' }
        )
        break
      }
      case 'damage': {
        const used = steps[steps.length - 1]
        if (used && event.amount > 0) {
          used.hp = { side: event.target, value: event.hp }
          used.hit = event.target === 'player' ? 'enemy' : 'player'
        }
        if (event.crit) steps.push({ text: 'A critical hit!' })
        const text = effectivenessText(
          event.effectiveness,
          displayName(state, event.target)
        )
        if (text) steps.push({ text })
        break
      }
      case 'faint':
        steps.push({
          faint: event.side,
          text: `${displayName(state, event.side)} fainted!`
        })
        break
      case 'levelUp':
        steps.push({
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
        steps.push({
          show: { fighter: event.fighter, side: 'player' },
          text: event.from ? `Come back, ${event.from}! Go, ${name}!` : `Go! ${name}!`
        })
        break
      }
      case 'xp':
        steps.push({ text: `${event.name} gained ${event.amount} XP!` })
        break
    }
  }
  return steps
}
```

- [ ] **Step 4: Replace `src/lib/battle/flow.ts`**

```ts
import {
  activeFighter,
  type BattleEvent,
  type BattleState,
  type Fighter,
  type Side
} from './engine'
import { introSteps, type Step, stepsFor } from './script'

export type FlowAction =
  | { events: BattleEvent[]; state: BattleState; type: 'resolved' }
  | { type: 'advance' }
  | { type: 'back' }
  | { type: 'fight' }
  | { type: 'run' }
  | { type: 'team' }

export type FlowState = {
  // Where to go when the message queue runs out.
  after: 'end' | 'menu' | 'switch'
  battle: BattleState
  fainted: Record<Side, boolean>
  index: number
  // Increments each time a message is shown, so repeated text retypes.
  messageId: number
  outcome: null | Outcome
  phase: Phase
  // What the scene shows: changes only when the message that causes it shows.
  shown: Record<Side, Fighter>
  shownHp: Record<Side, number>
  steps: Step[]
}

export type Outcome = 'caught' | 'lost' | 'ran' | 'won'

// The screen's state machine on top of the pure rules: queued messages, what
// the scene shows, and which menu is open. Pure (the caller resolves turns
// with its rng) so StrictMode's double reducer calls are safe.
export type Phase = 'end' | 'menu' | 'messages' | 'moves' | 'switch' | 'team'

// Phases from which a resolved turn (or a send-out) is accepted.
const ACTING: readonly Phase[] = ['menu', 'moves', 'switch', 'team']

export function currentStep(state: FlowState): Step | undefined {
  return state.phase === 'messages' ? state.steps[state.index] : undefined
}

export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case 'advance': {
      if (state.phase !== 'messages') return state
      if (state.index + 1 < state.steps.length) {
        return enter(state, state.index + 1)
      }
      return { ...state, phase: state.after }
    }
    case 'back':
      return state.phase === 'moves' || state.phase === 'team'
        ? { ...state, phase: 'menu' }
        : state
    case 'fight':
      return state.phase === 'menu' ? { ...state, phase: 'moves' } : state
    case 'resolved': {
      if (!ACTING.includes(state.phase) || action.events.length === 0) {
        return state
      }
      const { winner } = action.state
      const after = winner ? 'end' : action.state.mustSwitch ? 'switch' : 'menu'
      return queue(
        { ...state, battle: action.state },
        stepsFor(action.state, action.events),
        after,
        outcomeOf(action.state)
      )
    }
    case 'run':
      if (state.phase !== 'menu') return state
      return queue(state, [{ text: 'Got away safely!' }], 'end', 'ran')
    case 'team':
      return state.phase === 'menu' ? { ...state, phase: 'team' } : state
  }
}

export function startFlow(battle: BattleState): FlowState {
  const player = activeFighter(battle)
  return enter(
    {
      after: 'menu',
      battle,
      fainted: { enemy: false, player: false },
      index: 0,
      messageId: 0,
      outcome: null,
      phase: 'messages',
      shown: { enemy: battle.enemy, player },
      shownHp: { enemy: battle.enemy.hp, player: player.hp },
      steps: introSteps(battle)
    },
    0
  )
}

// Show step `index` and apply its effects to the scene.
function enter(state: FlowState, index: number): FlowState {
  const step = state.steps[index]
  if (!step) return state
  let { fainted, shown, shownHp } = state
  if (step.show) {
    const { fighter, side } = step.show
    shown = { ...shown, [side]: fighter }
    shownHp = { ...shownHp, [side]: fighter.hp }
    fainted = { ...fainted, [side]: fighter.hp === 0 }
  }
  if (step.hp) shownHp = { ...shownHp, [step.hp.side]: step.hp.value }
  if (step.faint) fainted = { ...fainted, [step.faint]: true }
  return {
    ...state,
    fainted,
    index,
    messageId: state.messageId + 1,
    phase: 'messages',
    shown,
    shownHp
  }
}

function outcomeOf(state: BattleState): null | Outcome {
  if (state.winner === 'enemy') return 'lost'
  if (state.winner === 'player') return state.caught ? 'caught' : 'won'
  return null
}

function queue(
  state: FlowState,
  steps: Step[],
  after: FlowState['after'],
  outcome: null | Outcome
): FlowState {
  return enter({ ...state, after, outcome, steps }, 0)
}
```

- [ ] **Step 5: Run to see them pass**

Run: `pnpm exec vitest run src/lib/battle`
Expected: PASS for all battle-module tests.

- [ ] **Step 6: Checkpoint** — `pnpm exec eslint src/lib/battle --fix`

---

### Task 4: Team model and the saved-team hook

**Files:**
- Create: `src/lib/team/team.ts`, `src/hooks/useTeam.ts`
- Modify: `src/test/setup.ts` (clear `localStorage` after each test)
- Test: `src/lib/team/team.test.ts`, `src/hooks/useTeam.test.ts`

**Interfaces:**
- Consumes: `MAX_TEAM`, `type BattleState`, `type Fighter` (engine); `maxHpAt`, `START_LEVEL`, `xpForLevel` (stats).
- Produces:
  - `type TeamMember = { creatureId: number; hp: null | number; level: number; uid: string; xp: number }`
  - `newMember(creature, uid, level?)`, `addMember(team, member)`, `removeMember(team, uid)`, `restAll(team)`,
    `isTeamFull(team)`, `memberHp(member, creature)`, `memberMaxHp(member, creature)`, `saveBattle(team, state)`,
    `parseTeam(raw)`, `serializeTeam(team)`, `makeUid()`, `TEAM_VERSION = 1`
  - `useTeam(): readonly [TeamMember[], (update: (team) => TeamMember[]) => void]`, `updateTeam(update)`,
    `TEAM_STORAGE_KEY = 'pokemon-explorer:team'`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/team/team.test.ts
import { describe, expect, it } from 'vitest'

import { createBattle, MAX_TEAM } from '@/lib/battle/engine'
import { makeCreature, makeFighter } from '@/test/battle'

import {
  addMember,
  memberHp,
  newMember,
  parseTeam,
  removeMember,
  restAll,
  saveBattle,
  serializeTeam,
  type TeamMember
} from './team'

const member = (uid: string, extra: Partial<TeamMember> = {}): TeamMember => ({
  creatureId: 1,
  hp: null,
  level: 5,
  uid,
  xp: 125,
  ...extra
})

describe('team model', () => {
  it('starts new members at Lv5 with full HP', () => {
    expect(newMember(makeCreature({ id: 7 }), 'u1')).toEqual({
      creatureId: 7,
      hp: null,
      level: 5,
      uid: 'u1',
      xp: 125
    })
    expect(memberHp(member('a'), makeCreature())).toBe(25)
    expect(memberHp(member('a', { hp: 3 }), makeCreature())).toBe(3)
  })

  it('adds up to six, removes by uid and rests everyone', () => {
    let team: TeamMember[] = []
    for (let i = 0; i < MAX_TEAM + 2; i++) team = addMember(team, member(`m${i}`, { hp: 0 }))
    expect(team).toHaveLength(MAX_TEAM)
    team = removeMember(team, 'm0')
    expect(team.map(m => m.uid)).not.toContain('m0')
    expect(restAll(team).every(m => m.hp === null)).toBe(true)
  })

  it('saves battle HP, XP and levels back by uid', () => {
    const fighter = { ...makeFighter({}, 7, { uid: 'a' }), hp: 4, xp: 400 }
    const state = createBattle([fighter], makeFighter({ id: 2 }, 5, { uid: 'wild-1' }))
    expect(saveBattle([member('a'), member('b')], state)).toEqual([
      { creatureId: 1, hp: 4, level: 7, uid: 'a', xp: 400 },
      member('b')
    ])
  })

  it('adds a caught creature once, even if saved twice', () => {
    const wild = { ...makeFighter({ id: 2 }, 5, { uid: 'wild-1' }), hp: 3 }
    const state = { ...createBattle([makeFighter({}, 5, { uid: 'a' })], wild), caught: true }
    const once = saveBattle([member('a')], state)
    const twice = saveBattle(once, state)
    expect(twice).toHaveLength(2)
    expect(twice[1]).toEqual({ creatureId: 2, hp: 3, level: 5, uid: 'wild-1', xp: 125 })
  })
})

describe('parseTeam', () => {
  it('round-trips a saved team', () => {
    const team = [member('a', { hp: 2 })]
    expect(parseTeam(serializeTeam(team))).toEqual(team)
  })

  it.each([
    ['missing', null],
    ['not JSON', '{oops'],
    ['wrong version', JSON.stringify({ members: [], version: 99 })],
    ['not an object', '42'],
    ['members not a list', JSON.stringify({ members: {}, version: 1 })]
  ])('returns an empty team when %s', (_, raw) => {
    expect(parseTeam(raw)).toEqual([])
  })

  it('drops malformed members and keeps at most six', () => {
    const good = member('ok')
    const raw = JSON.stringify({
      members: [
        good,
        { ...good, uid: '' },
        { ...good, level: 0 },
        { ...good, creatureId: 'x' },
        { ...good, hp: -1 },
        ...Array.from({ length: 8 }, (_, i) => member(`n${i}`))
      ],
      version: 1
    })
    const team = parseTeam(raw)
    expect(team[0]).toEqual(good)
    expect(team).toHaveLength(MAX_TEAM)
  })
})
```

```ts
// src/hooks/useTeam.test.ts
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { addMember, type TeamMember } from '@/lib/team/team'

import { TEAM_STORAGE_KEY, useTeam } from './useTeam'

const member: TeamMember = { creatureId: 1, hp: null, level: 5, uid: 'a', xp: 125 }

describe('useTeam', () => {
  it('saves to localStorage and reads it back', () => {
    const { result } = renderHook(() => useTeam())
    expect(result.current[0]).toEqual([])
    act(() => result.current[1](team => addMember(team, member)))
    expect(result.current[0]).toEqual([member])
    expect(JSON.parse(localStorage.getItem(TEAM_STORAGE_KEY)!)).toEqual({
      members: [member],
      version: 1
    })
  })

  it('ignores a corrupt save', () => {
    localStorage.setItem(TEAM_STORAGE_KEY, '{nope')
    const { result } = renderHook(() => useTeam())
    expect(result.current[0]).toEqual([])
  })

  it('follows changes made in another tab', () => {
    const { result } = renderHook(() => useTeam())
    act(() => {
      localStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify({ members: [member], version: 1 }))
      window.dispatchEvent(new StorageEvent('storage', { key: TEAM_STORAGE_KEY }))
    })
    expect(result.current[0]).toEqual([member])
  })

  it('keeps working in memory when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    const { result } = renderHook(() => useTeam())
    act(() => result.current[1](team => addMember(team, member)))
    expect(result.current[0]).toEqual([member])
  })
})
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm exec vitest run src/lib/team src/hooks/useTeam.test.ts`
Expected: FAIL, unresolved imports.

- [ ] **Step 3: Implement**

```ts
// src/lib/team/team.ts
import type { Pokemon } from '../pokemon'

import { type BattleState, type Fighter, MAX_TEAM } from '../battle/engine'
import { MAX_LEVEL, maxHpAt, START_LEVEL, xpForLevel } from '../battle/stats'

// Only progress is saved; names, types and stats come from the API by id.
export type TeamMember = {
  creatureId: number
  // null = full HP, so resting needs no creature data.
  hp: null | number
  level: number
  // The same creature can join twice, so members are keyed by uid, not id.
  uid: string
  xp: number
}

export const TEAM_VERSION = 1

export const isTeamFull = (team: readonly TeamMember[]) =>
  team.length >= MAX_TEAM

export function newMember(
  creature: Pokemon,
  uid: string,
  level = START_LEVEL
): TeamMember {
  return { creatureId: creature.id, hp: null, level, uid, xp: xpForLevel(level) }
}

export function addMember(team: TeamMember[], member: TeamMember) {
  return isTeamFull(team) ? team : [...team, member]
}

export const removeMember = (team: TeamMember[], uid: string) =>
  team.filter(member => member.uid !== uid)

export const restAll = (team: TeamMember[]) =>
  team.map(member => (member.hp === null ? member : { ...member, hp: null }))

export const memberMaxHp = (member: TeamMember, creature: Pokemon) =>
  maxHpAt(creature.hp, member.level)

export const memberHp = (member: TeamMember, creature: Pokemon) =>
  member.hp ?? memberMaxHp(member, creature)

// Writes a battle's HP, XP and levels back by uid, and adds a caught creature
// (once: its uid is checked, so saving after every turn is safe).
export function saveBattle(team: TeamMember[], state: BattleState) {
  const fighters = new Map(state.party.map(fighter => [fighter.uid, fighter]))
  const saved = team.map(member => {
    const fighter = fighters.get(member.uid)
    return fighter ? fromFighter(fighter) : member
  })
  const caught = state.caught && !saved.some(m => m.uid === state.enemy.uid)
  return caught ? addMember(saved, fromFighter(state.enemy)) : saved
}

export function serializeTeam(team: TeamMember[]) {
  return JSON.stringify({ members: team, version: TEAM_VERSION })
}

// Anything unexpected (old version, hand-edited, corrupt) becomes an empty
// team or loses just the bad members; it never throws.
export function parseTeam(raw: null | string): TeamMember[] {
  if (!raw) return []
  try {
    const data: unknown = JSON.parse(raw)
    if (!isRecord(data) || data.version !== TEAM_VERSION) return []
    if (!Array.isArray(data.members)) return []
    return data.members.filter(isMember).slice(0, MAX_TEAM)
  } catch {
    return []
  }
}

export function makeUid() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function fromFighter(fighter: Fighter): TeamMember {
  return {
    creatureId: fighter.creature.id,
    hp: fighter.hp >= fighter.maxHp ? null : fighter.hp,
    level: fighter.level,
    uid: fighter.uid,
    xp: fighter.xp
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

const isWhole = (value: unknown, min: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min

function isMember(value: unknown): value is TeamMember {
  return (
    isRecord(value) &&
    isWhole(value.creatureId, 1) &&
    isWhole(value.level, 1) &&
    (value.level as number) <= MAX_LEVEL &&
    isWhole(value.xp, 0) &&
    typeof value.uid === 'string' &&
    value.uid !== '' &&
    (value.hp === null || isWhole(value.hp, 0))
  )
}
```

```ts
// src/hooks/useTeam.ts
import { useSyncExternalStore } from 'react'

import { parseTeam, serializeTeam, type TeamMember } from '@/lib/team/team'

export const TEAM_STORAGE_KEY = 'pokemon-explorer:team'

type Update = (team: TeamMember[]) => TeamMember[]

const EMPTY: TeamMember[] = []
const listeners = new Set<() => void>()
// Used when storage is blocked (private mode, disabled site data).
let memory: null | string = null
// Cached by the raw string so useSyncExternalStore gets a stable snapshot.
let snapshot: { raw: null | string; team: TeamMember[] } = {
  raw: null,
  team: EMPTY
}

// The saved team, shared by every screen and kept in sync across tabs.
export function useTeam() {
  const team = useSyncExternalStore(subscribe, readTeam, () => EMPTY)
  return [team, updateTeam] as const
}

export function updateTeam(update: Update) {
  const raw = serializeTeam(update(readTeam()))
  memory = raw
  try {
    window.localStorage.setItem(TEAM_STORAGE_KEY, raw)
  } catch {
    // Blocked storage: the in-memory copy carries the session.
  }
  listeners.forEach(listener => listener())
}

function readRaw() {
  try {
    return window.localStorage.getItem(TEAM_STORAGE_KEY)
  } catch {
    return memory
  }
}

function readTeam() {
  const raw = readRaw()
  if (raw !== snapshot.raw) snapshot = { raw, team: parseTeam(raw) }
  return snapshot.team
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === TEAM_STORAGE_KEY || event.key === null) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}
```

In `src/test/setup.ts`, inside the existing `afterEach`, add `localStorage.clear()` after `cleanup()`.

- [ ] **Step 4: Run to see them pass**

Run: `pnpm exec vitest run src/lib/team src/hooks/useTeam.test.ts`
Expected: PASS.

- [ ] **Step 5: Checkpoint** — `pnpm exec eslint src/lib/team src/hooks --fix && pnpm exec tsc -b`

---

### Task 5: Explorer: Add to team and the team bar

**Files:**
- Create: `src/hooks/useTeamCreatures.ts`, `src/components/team/TeamBar.tsx`
- Modify: `src/components/CreatureCard.tsx`, `src/screens/ExplorerScreen.tsx`
- Test: `src/components/team/TeamBar.test.tsx` (new), `src/components/CreatureCard.test.tsx`,
  `src/screens/ExplorerScreen.test.tsx`

**Interfaces:**
- Consumes: Task 4 (`useTeam`, `addMember`, `newMember`, `removeMember`, `restAll`, `memberHp`, `memberMaxHp`,
  `isTeamFull`, `makeUid`), `fetchPokemonById`, `CreatureNotFoundError`, `MAX_TEAM`.
- Produces:
  - `creatureQuery(id)` (TanStack options) and `useTeamCreatures(team)` →
    `{ creatures: Map<number, Pokemon>; isError; isPending; missing: Set<number>; retry() }` (a not-found id goes in
    `missing`, not `isError`)
  - `TeamBar({ onNotice })`
  - `CreatureCard` props gain `onAddToTeam?: (pokemon: Pokemon) => void` and `teamFull?: boolean`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/team/TeamBar.test.tsx
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { TEAM_STORAGE_KEY } from '@/hooks/useTeam'
import { serializeTeam, type TeamMember } from '@/lib/team/team'
import { stubFetch } from '@/test/fake-api'
import { renderWithClient } from '@/test/render'

import { TeamBar } from './TeamBar'

const save = (members: TeamMember[]) =>
  localStorage.setItem(TEAM_STORAGE_KEY, serializeTeam(members))

describe('TeamBar', () => {
  it('invites you to add creatures when empty', () => {
    stubFetch()
    renderWithClient(<TeamBar onNotice={() => {}} />)
    expect(screen.getByRole('region', { name: /Your team/ })).toHaveTextContent('0/6')
    expect(screen.getByText(/Open a card and add a creature/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Battle/ })).toBeNull()
  })

  it('lists members with level and HP, rests and removes', async () => {
    stubFetch()
    save([
      { creatureId: 1, hp: 3, level: 5, uid: 'a', xp: 125 },
      { creatureId: 2, hp: null, level: 7, uid: 'b', xp: 343 }
    ])
    const onNotice = vi.fn()
    renderWithClient(<TeamBar onNotice={onNotice} />)
    const list = screen.getByRole('list', { name: 'Team members' })
    expect(await within(list).findByText('Geovanni')).toBeInTheDocument()
    // Geovanni base HP 28 at Lv5 → 17 max.
    expect(list).toHaveTextContent('3/17')
    expect(list).toHaveTextContent('Lv7')
    expect(screen.getByRole('link', { name: '▶ Battle' })).toHaveAttribute('href', '/battle')

    await userEvent.click(screen.getByRole('button', { name: 'Rest' }))
    expect(list).toHaveTextContent('17/17')
    expect(onNotice).toHaveBeenCalledWith('Your team is rested!')
    expect(screen.getByRole('button', { name: 'Rest' })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: 'Remove Britney from team' }))
    expect(within(list).queryByText('Britney')).toBeNull()
  })

  it('shows a creature that is no longer on file as missing', async () => {
    stubFetch()
    save([{ creatureId: 5000, hp: null, level: 5, uid: 'gone', xp: 125 }])
    renderWithClient(<TeamBar onNotice={() => {}} />)
    expect(await screen.findByText('Missing creature')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remove Missing creature from team' }))
    expect(screen.getByText(/Open a card and add a creature/)).toBeInTheDocument()
  })
})
```

Add to `src/components/CreatureCard.test.tsx` (inside the `describe`):

```tsx
  it('adds to the team from an expanded card', async () => {
    const onAddToTeam = vi.fn()
    render(
      <ul>
        <CreatureCard expanded onAddToTeam={onAddToTeam} onToggle={() => {}} pokemon={pokemon} />
      </ul>
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add Geovanni to team' }))
    expect(onAddToTeam).toHaveBeenCalledWith(pokemon)
  })

  it('disables adding when the team is full', () => {
    render(
      <ul>
        <CreatureCard expanded onAddToTeam={() => {}} onToggle={() => {}} pokemon={pokemon} teamFull />
      </ul>
    )
    expect(screen.getByRole('button', { name: 'Team full' })).toBeDisabled()
  })
```

Add to `src/screens/ExplorerScreen.test.tsx` (inside the main `describe`; uses existing imports, add `TEAM_STORAGE_KEY`):

```tsx
  it('adds a creature to the team from its card', async () => {
    stubFetch()
    renderWithClient(<ExplorerScreen />)
    await userEvent.click(await screen.findByRole('button', { name: 'Geovanni' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add Geovanni to team' }))
    const team = screen.getByRole('list', { name: 'Team members' })
    expect(await within(team).findByText('Geovanni')).toBeInTheDocument()
    expect(screen.getByText('Geovanni joined your team!')).toBeInTheDocument()
    expect(localStorage.getItem(TEAM_STORAGE_KEY)).toContain('"creatureId":1')
  })
```

(If an existing explorer test counts every button in the grid, scope it to `button[aria-expanded]`; the new Add
button only exists inside expanded cards.)

- [ ] **Step 2: Run to see them fail**

Run: `pnpm exec vitest run src/components src/screens/ExplorerScreen.test.tsx`
Expected: FAIL (no TeamBar; no Add button).

- [ ] **Step 3: Implement**

```ts
// src/hooks/useTeamCreatures.ts
import { useQueries } from '@tanstack/react-query'

import type { Pokemon } from '@/lib/pokemon'
import type { TeamMember } from '@/lib/team/team'

import { CreatureNotFoundError, fetchPokemonById } from '@/lib/api'

const retryUnlessMissing = (failures: number, error: Error) =>
  !(error instanceof CreatureNotFoundError) && failures < 1

export function creatureQuery(id: number) {
  return {
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchPokemonById(id, signal),
    queryKey: ['pokemon', 'by-id', id],
    retry: retryUnlessMissing,
    staleTime: Infinity
  }
}

// Creature data for every team member. An id that's no longer on file is
// "missing" (shown and removable), not an error that blocks the screen.
export function useTeamCreatures(team: readonly TeamMember[]) {
  const ids = [...new Set(team.map(member => member.creatureId))]
  const results = useQueries({ queries: ids.map(creatureQuery) })
  const creatures = new Map<number, Pokemon>()
  const missing = new Set<number>()
  let isError = false
  results.forEach((result, index) => {
    if (result.data) creatures.set(ids[index], result.data)
    else if (result.error instanceof CreatureNotFoundError) missing.add(ids[index])
    else if (result.isError) isError = true
  })
  return {
    creatures,
    isError,
    isPending: results.some(result => result.isPending),
    missing,
    retry: () => results.forEach(result => result.isError && void result.refetch())
  }
}
```

```tsx
// src/components/team/TeamBar.tsx
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
    <DialogBox aria-labelledby="team-heading" className="flex flex-col gap-3" role="region">
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
        <ul aria-label="Team members" className="grid gap-2 xs:grid-cols-2 lg:grid-cols-3">
          {team.map(member => {
            const creature = creatures.get(member.creatureId)
            const name = creature?.name ?? (missing.has(member.creatureId) ? 'Missing creature' : '…')
            return (
              <li className="flex items-center gap-2 rounded-inset frame-inset bg-inset p-2" key={member.uid}>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="flex items-baseline justify-between gap-2 text-label font-bold uppercase">
                    <span className="truncate">{name}</span>
                    <span className="shrink-0 text-caption">Lv{member.level}</span>
                  </p>
                  {creature && (
                    <HpBar hp={memberHp(member, creature)} max={memberMaxHp(member, creature)} />
                  )}
                </div>
                <button
                  aria-label={`Remove ${name} from team`}
                  className="size-9 shrink-0 rounded-tag text-label font-bold hover:bg-box focus-visible:focus-ring"
                  onClick={() => setTeam(current => removeMember(current, member.uid))}
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
```

`src/components/CreatureCard.tsx`: add the two optional props to `CreatureCardProps` and destructuring, and replace
the existing `▶ Battle` `<a>` with:

```tsx
            {/* Above the stretched name button's ::after so they get the click. */}
            <div className="relative z-10 flex flex-wrap gap-2">
              <a
                aria-label={`Battle with ${pokemon.name}`}
                className={buttonClass()}
                href={`/battle?id=${pokemon.id}`}
              >
                ▶ Battle
              </a>
              {onAddToTeam && (
                <Button
                  aria-label={teamFull ? 'Team full' : `Add ${pokemon.name} to team`}
                  disabled={teamFull}
                  onClick={() => onAddToTeam(pokemon)}
                  variant="secondary"
                >
                  {teamFull ? 'Team full' : '+ Add to team'}
                </Button>
              )}
            </div>
```

(import `Button` alongside `buttonClass` from `./ui/button`).

`src/screens/ExplorerScreen.tsx`:

```tsx
// new imports
import { TeamBar } from '@/components/team/TeamBar'
import { useTeam } from '@/hooks/useTeam'
import { addMember, isTeamFull, makeUid, newMember } from '@/lib/team/team'
import type { Pokemon } from '@/lib/pokemon'

// inside ExplorerScreen, after the existing state
  const [team, setTeam] = useTeam()
  const [teamNotice, setTeamNotice] = useState('')
  const addToTeam = useCallback(
    (creature: Pokemon) => {
      setTeam(current => addMember(current, newMember(creature, makeUid())))
      setTeamNotice(`${creature.name} joined your team!`)
    },
    [setTeam]
  )
  const teamFull = isTeamFull(team)
```

Render `<TeamBar onNotice={setTeamNotice} />` between `</header>` and the filters `<div>`, add
`<p aria-live="polite" className="sr-only">{teamNotice}</p>` after it, and pass `onAddToTeam={addToTeam}` and
`teamFull={teamFull}` to each `CreatureCard`.

- [ ] **Step 4: Run to see them pass**

Run: `pnpm exec vitest run src/components src/screens/ExplorerScreen.test.tsx`
Expected: PASS (fix any grid-wide button counts as noted in Step 1).

- [ ] **Step 5: Checkpoint** — `pnpm exec eslint . --fix --quiet && pnpm exec tsc -b`

---

### Task 6: Battle with the team: switch, catch, levels, saving

**Files:**
- Create: `src/hooks/useWildFighter.ts`
- Modify: `src/screens/BattleScreen.tsx`, `src/components/battle/BattleArena.tsx`,
  `src/components/battle/BattleScene.tsx`, `src/components/battle/BattleMenu.tsx`
- Delete: `src/hooks/useBattleCreatures.ts`
- Test: `src/screens/BattleScreen.test.tsx` (rewrite)

**Interfaces:**
- Consumes: everything above.
- Produces: `useWildFighter({ enabled, excludeId, levels, rng, round })`, `MenuItem.disabled?: boolean`,
  `BattleArena({ enemy: Fighter; onBattleAgain; onSave: (state: BattleState) => void; party: Fighter[]; rng })`,
  `BattleScene({ enemy: Fighter; player: Fighter; ... })` (shown fighters, real levels, player XP bar).

- [ ] **Step 1: Write the failing tests** (replace `src/screens/BattleScreen.test.tsx`)

```tsx
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TEAM_STORAGE_KEY } from '@/hooks/useTeam'
import { parseTeam, serializeTeam, type TeamMember } from '@/lib/team/team'
import { stubFetch } from '@/test/fake-api'
import { renderWithClient } from '@/test/render'

import { BattleScreen, parsePlayerId } from './BattleScreen'

// rng always 0: the wild creature is #2 Britney (Fighting) at the team level
// − 2 (Lv3, 23 HP, speed 15), the AI picks its best move, every move hits and
// crits, rolls are minimum and throws always succeed. At Lv5 #1 Geovanni
// (speed 18) and #3 Hershel (19) move first; their Flying/Fairy moves would
// knock her out, so tests that need her to survive use Quick Tackle (6 and 5
// damage).
const alwaysZero = () => 0

const liveRegion = () => document.querySelector('[aria-live="polite"]')!
const expectMessage = (text: RegExp | string) =>
  waitFor(() => expect(liveRegion()).toHaveTextContent(text))
const savedTeam = () => parseTeam(localStorage.getItem(TEAM_STORAGE_KEY))
const save = (members: TeamMember[]) =>
  localStorage.setItem(TEAM_STORAGE_KEY, serializeTeam(members))
const member = (uid: string, creatureId: number, extra: Partial<TeamMember> = {}): TeamMember => ({
  creatureId,
  hp: null,
  level: 5,
  uid,
  xp: 125,
  ...extra
})

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    addEventListener: () => {},
    matches: query.includes('reduce'),
    removeEventListener: () => {}
  }))
})

async function readUntil(text: RegExp | string) {
  for (let i = 0; i < 40; i++) {
    if (liveRegion().textContent?.match(text)) return
    await userEvent.keyboard('{Enter}')
  }
  throw new Error(`Never saw ${String(text)}; last: ${liveRegion().textContent}`)
}

async function open(playerId: null | number = null) {
  stubFetch()
  renderWithClient(<BattleScreen playerId={playerId} rng={alwaysZero} />)
  await expectMessage('A wild Britney appeared!')
  await readUntil(/What will .+ do\?/)
}

describe('BattleScreen', () => {
  it('starts a team from the picked creature when the team is empty', async () => {
    await open(1)
    expect(savedTeam()).toEqual([expect.objectContaining({ creatureId: 1, level: 5 })])
    const wild = screen.getByRole('region', { name: 'Wild creature' })
    const mine = screen.getByRole('region', { name: 'Your creature' })
    expect(wild).toHaveTextContent('Lv3')
    expect(wild).toHaveTextContent('23/23')
    expect(mine).toHaveTextContent('Lv5')
    expect(mine).toHaveTextContent('17/17')
  })

  it('has FIGHT, TEAM, CATCH and RUN on arrow keys', async () => {
    await open(1)
    expect(screen.getByRole('button', { name: 'Fight' })).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('button', { name: 'Team' })).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('button', { name: 'Run' })).toHaveFocus()
    await userEvent.keyboard('{ArrowLeft}')
    expect(screen.getByRole('button', { name: /Catch/ })).toHaveFocus()
  })

  it('saves HP after every turn', async () => {
    await open(1)
    await userEvent.keyboard('{Enter}{ArrowDown}{Enter}') // FIGHT, Quick Tackle
    await readUntil(/^Wild Britney used .+!$/)
    expect(savedTeam()[0].hp).not.toBeNull()
  })

  it('catches the wild creature and adds it to the team', async () => {
    await open(1)
    await userEvent.click(screen.getByRole('button', { name: /Catch/ }))
    await expectMessage('You threw a ball!')
    await readUntil('Gotcha! Wild Britney was caught!')
    await readUntil(/Gotcha!/)
    expect(await screen.findByRole('heading', { name: 'Gotcha!' })).toBeInTheDocument()
    expect(savedTeam().map(m => m.creatureId)).toEqual([1, 2])
  })

  it('switches creatures from the TEAM menu', async () => {
    save([member('a', 1), member('b', 3)])
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Team' }))
    const list = screen.getByRole('group', { name: 'Team' })
    expect(within(list).getByRole('button', { name: /Geovanni/ })).toBeDisabled()
    await userEvent.click(within(list).getByRole('button', { name: /Hershel/ }))
    await expectMessage('Come back, Geovanni! Go, Hershel!')
  })

  it('asks who to send out after a faint, and loses only when all faint', async () => {
    save([member('a', 1, { hp: 1 }), member('b', 3, { hp: 1 })])
    await open()
    await userEvent.keyboard('{Enter}{ArrowDown}{Enter}') // FIGHT, Quick Tackle
    await readUntil('Who will you send out?')
    await userEvent.click(screen.getByRole('button', { name: /Hershel/ }))
    await expectMessage('Go! Hershel!')
    await readUntil(/What will Hershel do\?/)
    // Hershel's moves: Glimmer, Moonbeam Burst, Palm Strike, Quick Tackle.
    await userEvent.keyboard('{Enter}{ArrowDown}{ArrowRight}{Enter}')
    await readUntil(/You lost/)
    expect(screen.getByRole('heading', { name: 'You lost…' })).toBeInTheDocument()
    expect(savedTeam().every(m => m.hp === 0)).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: 'Battle again' }))
    expect(await screen.findByText(/too tired to battle/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Rest' }))
    await expectMessage('A wild Britney appeared!')
  })

  it('explains an empty team', async () => {
    stubFetch()
    renderWithClient(<BattleScreen playerId={null} rng={alwaysZero} />)
    expect(await screen.findByText(/No creature to send out!/)).toBeInTheDocument()
  })

  it('explains a creature that is not on file', async () => {
    stubFetch()
    renderWithClient(<BattleScreen playerId={5000} rng={alwaysZero} />)
    expect(await screen.findByText(/No creature to send out!/)).toBeInTheDocument()
  })
})

describe('parsePlayerId', () => {
  it.each([
    ['?id=12', 12],
    ['?id=0', null],
    ['?id=abc', null],
    ['', null]
  ])('%s → %s', (search, expected) => {
    expect(parsePlayerId(search)).toBe(expected)
  })
})
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm exec vitest run src/screens/BattleScreen.test.tsx`
Expected: FAIL (the screen still uses the one-creature loader).

- [ ] **Step 3: Implement the wild fighter hook**

```ts
// src/hooks/useWildFighter.ts
import { useQuery } from '@tanstack/react-query'

import { CreatureNotFoundError, fetchRandomPokemon } from '@/lib/api'
import { createFighter, type Rng, wildLevel } from '@/lib/battle/engine'
import { makeUid } from '@/lib/team/team'

type Options = {
  enabled: boolean
  excludeId: number
  levels: number[]
  rng: Rng
  round: number
}

// A random wild creature near the team's level. `round` keys it, so "Battle
// again" draws a new one; levels are read when the round starts.
export function useWildFighter({ enabled, excludeId, levels, rng, round }: Options) {
  return useQuery({
    enabled,
    gcTime: 0,
    queryFn: async ({ signal }) => {
      const creature = await fetchRandomPokemon(excludeId, rng, signal)
      return createFighter(creature, wildLevel(levels, rng), { uid: `wild-${makeUid()}` })
    },
    queryKey: ['battle', 'wild', round],
    retry: (failures, error) => !(error instanceof CreatureNotFoundError) && failures < 1,
    staleTime: Infinity
  })
}
```

- [ ] **Step 4: Rewrite `BattleLoader` in `src/screens/BattleScreen.tsx`** (keep `BattleScreen`, `parsePlayerId`,
  `NotFound`; update `NotFound` copy to "No creature to send out! Add one in the explorer first.")

```tsx
function BattleLoader({ playerId, rng }: { playerId: null | number; rng: Rng }) {
  const [team, setTeam] = useTeam()
  const [round, setRound] = useState(0)
  const starterId = team.length === 0 ? playerId : null
  const starter = useQuery({ ...creatureQuery(starterId ?? 0), enabled: starterId !== null })

  // First visit from a card: that creature becomes the team. The updater
  // re-checks emptiness, so a double effect can't add it twice.
  useEffect(() => {
    if (!starter.data) return
    const creature = starter.data
    setTeam(current => (current.length > 0 ? current : addMember(current, newMember(creature, makeUid()))))
  }, [setTeam, starter.data])

  const { creatures, isError, isPending, retry } = useTeamCreatures(team)
  const party = team.flatMap(member => {
    const creature = creatures.get(member.creatureId)
    return creature
      ? [createFighter(creature, member.level, { hp: member.hp, uid: member.uid, xp: member.xp })]
      : []
  })
  const ready = team.length > 0 && !isPending && !isError
  const canFight = party.some(fighter => fighter.hp > 0)
  const wild = useWildFighter({
    enabled: ready && canFight,
    excludeId: party[0]?.creature.id ?? 0,
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
      />
    )
  }
  if (team.length === 0) {
    if (starterId !== null && !starter.isError) return <Searching />
    return <NotFound />
  }
  if (isError || wild.isError) {
    return (
      <DialogBox className="text-center" role="alert">
        <p className="text-body-lg font-bold text-danger">The connection fled! Try again.</p>
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
  if (ready && !canFight) {
    return (
      <DialogBox className="flex flex-col items-center gap-4 text-center">
        <p className="text-body-lg">Your team is too tired to battle. Rest first!</p>
        <Button onClick={() => setTeam(restAll)}>Rest</Button>
      </DialogBox>
    )
  }
  return <Searching />
}

function Searching() {
  return (
    <DialogBox className="text-center" showMore>
      <p className="text-body-lg" role="status">Searching the tall grass…</p>
    </DialogBox>
  )
}
```

Imports: `useQuery` (TanStack), `useEffect`, `useState`; `creatureQuery`, `useTeamCreatures`; `useTeam`;
`useWildFighter`; `createFighter`, `type Rng`; `addMember`, `makeUid`, `newMember`, `restAll`, `saveBattle`.
Delete `src/hooks/useBattleCreatures.ts`.

- [ ] **Step 5: Per-item `disabled` in `BattleMenu`** — add `disabled?: boolean` to `MenuItem` and pass
  `disabled={disabled || item.disabled === true}` to each item's `MenuButton`.

- [ ] **Step 6: Update `BattleScene`** to take shown fighters with real levels and an XP bar

Replace `LEVEL` with each fighter's `level` (`Lv{fighter.level}`), key both `InfoBox` and `Sprite` by `fighter.uid`
(so a switch remounts the art and the HP counter), and under the player's `HpBar` add:

```tsx
      {side === 'player' && (
        <span aria-hidden className="block h-1.5 overflow-hidden rounded-inset bg-track">
          <span
            className="block h-full bg-focus"
            style={{ width: `${xpProgress(fighter.level, fighter.xp) * 100}%` }}
          />
        </span>
      )}
```

(import `xpProgress` from `@/lib/battle/stats`; remove the `LEVEL` import).

- [ ] **Step 7: Update `BattleArena`**

- Props: `{ enemy: Fighter; onBattleAgain; onSave: (state: BattleState) => void; party: Fighter[]; rng }`;
  initializer `startFlow(createBattle(party, enemy))`.
- `const act = (result: { events: BattleEvent[]; state: BattleState }) => { dispatch({ type: 'resolved', ...result });
  onSave(result.state) }`; moves call `act(resolveTurn(flow.battle, { index, type: 'move' }, rng))`.
- Main items (2×2): Fight → `dispatch({ type: 'fight' })`; Team → `dispatch({ type: 'team' })`; Catch →
  `act(resolveTurn(flow.battle, { type: 'catch' }, rng))`, `disabled: flow.battle.party.length >= MAX_TEAM`, detail
  `<span className="text-caption text-ink-muted">Team full</span>` when disabled; Run → `dispatch({ type: 'run' })`.
- Team items for phases `team` and `switch`: one per `flow.battle.party` fighter, `key: fighter.uid`,
  `label: fighter.creature.name`, `disabled: fighter.hp === 0 || index === flow.battle.active`, detail caption
  `Lv{level} · HP {hp}/{maxHp}` plus ` · In battle` / ` · Fainted`; select → in `switch`:
  `act(sendOut(flow.battle, index))`, in `team`: `act(resolveTurn(flow.battle, { to: index, type: 'switch' }, rng))`.
  Render with `label="Team"`, `cols={2}`, and `onBack` only in the `team` phase.
- Prompt text when no step is showing: phase `switch` → "Who will you send out?", else
  `What will ${activeFighter(flow.battle).creature.name} do?`.
- Focus effect: `messages` → message button; `end` → Battle again; `moves` → button `lastMove.current`; otherwise
  first `button:enabled` in the menu.
- Scene: `enemy={flow.shown.enemy}` `player={flow.shown.player}`.
- Outcome copy: won → "You won!" / "The wild creature was defeated."; caught → "Gotcha!" /
  `${flow.battle.enemy.creature.name} joined your team.`; lost → "You lost…" / "Rest your team, then try again.";
  ran → "Got away!" / "You fled the battle."

- [ ] **Step 8: Run to see them pass**

Run: `pnpm exec vitest run src/screens/BattleScreen.test.tsx`
Expected: PASS.

- [ ] **Step 9: Checkpoint** — `pnpm exec eslint . --fix --quiet && pnpm test && pnpm exec tsc -b`

---

### Task 7: Docs and full verification

**Files:**
- Modify: `docs/decisions.md`, `docs/DESIGN.md`, `docs/FINNY-requirements.md`

- [ ] **Step 1: Decision log** — append "## 2026-10-15: Team, catching and levels" covering: localStorage team keyed by
  uid with `hp: null` = full (rejected: server storage, URL state); level stats from the games' formula without
  IV/EV (rejected: base stats + level term only, because levels barely mattered); Gen III catch curve with shake
  checks and a catch rate from total stats; XP ÷7 with the n³ curve and XP on catch; crit 1/24 ×1.5; the battle
  saves after every turn; a started battle keeps running when saving makes the team tired; out of scope: boxes,
  status, stat stages, PP, run odds.
- [ ] **Step 2: DESIGN.md** — one bullet for the team bar and the 2×2 FIGHT/TEAM/CATCH/RUN menu and XP bar.
- [ ] **Step 3: Requirements** — extend the "Extra" bullet: team of 6 saved in the browser, catching, levels.
- [ ] **Step 4: Full verification**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: no lint output, all tests pass, both bundles build.

- [ ] **Step 5: Browser check** — dev server on :5199: add 2 creatures in the explorer, battle, switch, catch a
  third, lose a battle, rest, reload and confirm the team, levels and HP persist; check 375px width and the console
  for errors.
