# Team, catching and levels: design

Date: 2026-10-15. Builds on the battle screen (`docs/decisions.md`, 2026-10-15: Battle screen).

## Goal

Creatures travel with you. You build a team of up to 6 in the explorer, grow it by catching wild creatures, and the
team keeps its HP and levels between battles until you rest. Battles gain critical hits, levels and XP, modelled on
the main-series games but simplified (no IVs, EVs, natures, items, status or PP).

Success: a reviewer can add creatures from the explorer, battle with the team (switching, catching, losing only when
all faint), see levels rise, rest, reload the page and find the team as they left it. Rules stay pure and unit-tested.

## Decisions taken in chat

| Topic | Choice |
| --- | --- |
| Line-up | Build a team from expanded explorer cards **and** catch in battle. Max 6. |
| HP between battles | Carries over, fainted stays fainted, free **REST** heals all (outside battle). |
| Catching | **CATCH** menu action; odds rise as wild HP falls; a failed throw uses the turn. |
| Mechanics | Critical hits + levels/XP. Status, stat stages and PP are out. |
| Persistence | `localStorage`, this browser only. |

## Rules (pure, `src/lib/battle/` and `src/lib/team/`)

All randomness stays injected (`rng`). Formulas follow the games where noted; constants live in one place.

- **Stats at level L** (games' formula without IV/EV/nature):
  `stat = floor(2 × base × L / 100) + 5`, `maxHp = floor(2 × base × L / 100) + L + 10`. At L50 this is base + 5
  (base + 60 for HP), so today's battles barely change. Damage uses these levelled attack/defense/sp. stats; turn
  order uses levelled speed.
- **Damage:** the existing formula with the attacker's level in the level term:
  `floor(((2 × L / 5 + 2) × power × atk / def) / 50 + 2)` × roll × STAB × type × crit. Immune does 0, else ≥ 1.
- **Critical hits:** 1/24 chance (Gen VII+), ×1.5. Message "A critical hit!". The AI's expected damage ignores crits.
- **Levels:** 1–100. Team creatures added from the explorer start at **Lv5**. Total XP to reach level n is `n³`
  (medium-fast curve); a creature at level n with XP ≥ (n+1)³ levels up (possibly several times).
- **XP gain:** `floor(baseXp × enemyLevel / 7)`, `baseXp = floor(totalStats / 4)`. Awarded to the creature on the
  field when the wild one faints **or** is caught. Leveling raises max HP; current HP rises by the same amount.
- **Catching:** `catchRate` from total base stats, linear from 255 at a total of 300 down to 30 at 1,070 (the data spans 298–1,071; clamped
  outside that), and
  ×0.5 again for legendaries, floored at 3. Modified rate `a = (3 × maxHp − 2 × hp) × catchRate / (3 × maxHp)`, so
  roughly rate/3 at full HP and rate near 0 HP. Capture chance `p = min(1, a / 255)`. Four shake checks each pass
  with `p^(1/4)` (so all four pass with chance p); the number passed before failing drives the messages ("The ball
  shook…" up to 3 times, then "Oh no! It broke free!" or "Gotcha! X was caught!"). Not allowed when the team is
  full (CATCH disabled, with a reason).
- **Wild level:** the team's average level ±2 (rng), clamped 2–100. With one creature, its level ±2.
- **Turn order with actions:** switch and catch happen before any move (as in the games); then moves by speed.
- **Fainting:** if your active creature faints you must pick another non-fainted one (free, not a turn). You lose
  when every team member has fainted ("You're out of creatures!"). Run always succeeds, as now.

## Team store (`src/lib/team/`)

- Saved shape (versioned): `{ version: 1, members: [{ uid, creatureId, level, xp, hp }] }`. `uid` is a random id so
  the same creature can be on the team twice. Creature data (name, types, stats) is fetched by id; only progress is
  stored.
- Pure functions: `addMember`, `removeMember`, `restAll`, `applyBattleResult` (HP + XP + level-ups + caught member),
  `parseTeam` (rejects bad JSON/shape/version → empty team, never throws).
- `useTeam()` hook: `useSyncExternalStore` over `localStorage` (try/catch on read and write) plus the `storage`
  event, so two tabs stay in sync.

## UI

- **Explorer:** an expanded card shows **+ Add to team** (disabled with "Team is full" at 6) next to ▶ Battle. The
  header gets a compact **team bar**: up to 6 slots with name, level and an HP bar, a **REST** button (heals all,
  message "Your team is rested!") and a remove (×) per member.
- **Battle entry:** `/battle` battles with the team. `/battle?id=N` (the ▶ Battle link) adds N to the team first if
  the team is empty, so a first visit still works. With a team but every member fainted, the screen says to rest
  and links to the explorer.
- **Battle menu:** FIGHT / TEAM / CATCH / RUN in a 2×2 grid. TEAM lists members (name, level, HP, fainted greyed
  out); picking one switches. After a forced switch the same list opens without a BACK item.
- **Info boxes:** show real levels (`Lv12`) and a thin XP bar under the player's HP bar.
- **Messages added:** "A critical hit!", "Come back, X! Go, Y!", "X grew to Lv13!", "X gained 42 XP!", the shake and
  catch lines, "You're out of creatures!".
- **End screen:** won / lost / ran / caught. "Battle again" keeps the team's new HP (no free heal).

## Testing

- Unit: stat formula (L50 ≈ base + 5), damage with level term, crit roll, XP curve and multi-level-ups, XP award,
  catch rate mapping, capture probability at full / low HP, shake count, wild-level range, turn order with
  switch/catch, team store reducers, `parseTeam` with corrupt data.
- UI (Testing Library, fake API): add to team from a card, team bar + rest, battle with 2 members: switch, forced
  switch after a faint, lose only when all faint, catch success adds a member, team persists across a remount.

## Out of scope

Storage boxes (catching beyond 6), status effects, stat stages, PP, items, run odds, evolution, cross-device sync.

## Build order

1. Rules: levelled stats, crits, XP, catch (engine + tests). Existing battle keeps working with a one-creature team.
2. Team store + explorer (add, team bar, rest).
3. Battle with the team: switch, forced switch, catch, XP and level-ups, saving results.
