# API slice 3: the battle engine in Python — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Python package `api/app/engine/` that plays battles exactly like `src/lib/battle/` (wild and friend), proven
by a golden file of scripted battles both suites replay. No routes yet: slice 4 calls it.

**Architecture:** Pure functions over plain data, like the TypeScript: state in, state and events out, input never
changed, every random draw through an injected `rng`. State is JSON-shaped dicts with the **same camelCase keys as
the TypeScript types** (`TypedDict`s), so what the engine returns is exactly what the database stores and the
frontend already renders, with no conversion layer. Parity is shown the slice 1 way: a TypeScript test records
scripted battles (creatures, levels, actions and the exact random numbers) with their events and states into a JSON
file, and the Python tests replay every one and must produce identical output.

**Tech Stack:** Python 3.13 (`TypedDict`, `copy`), pytest; Vitest for the recorder.

**Spec:** `docs/superpowers/specs/2026-10-26-fastapi-backend-design.md` ("Battle engine port"; Slices: 3). Decision:
`docs/backend/decisions.md` ("Every battle runs on the server").

## Global Constraints

- Same rules, same numbers, **same order of random draws** as `src/lib/battle/` (`engine.ts`, `versus.ts`,
  `stats.ts`, `moves.ts`, `type-chart.ts`, `catch.ts`, `clampTiming` from `versus.ts`). `flow.ts`, `script.ts` and
  `timing.ts`'s UI parts stay in the client.
- JSON output identical to the TypeScript's, keys and value types included (an `int` where TS has an integer).
- No new dependencies. No database or HTTP code in `app/engine/`.
- The TypeScript engine is unchanged; it still runs wild battles in the browser until slice 4.

## Review Focus

1. **`Math.round` vs Python `round`.** JS rounds .5 up; Python rounds .5 to even (`round(2.5) == 2`). `wildLevel`
   uses `Math.round` on a team average. (Task 3: golden case with a .5 average, plus a unit test.)
2. **Integer division and floats.** `Math.floor(a / b)` in JS is float division then floor; Python `a // b` on ints
   matches for positives but `int()` truncates toward zero. Damage formula results must match exactly. (Golden damage
   events cover many stat combinations.)
3. **`24` vs `24.0`.** Python's `24 == 24.0` is `True`, so a plain dict comparison would hide a float where TS has an
   int, and the client would see `24.0`. The golden comparison checks types too. (Task 2 helper `assert_same_json`.)
4. **Mutating the input.** The TS copies party fighters before a turn (`draft`); a Python port that mutates the
   caller's dicts would corrupt the stored state when a turn throws halfway. (Task 3 test: input unchanged.)
5. **Extra or missing `rng` calls.** One extra draw shifts every later random number and silently changes the
   battle. (Golden cases record how many numbers each step consumed; Python must consume exactly as many.)

## Files

| Path | Responsibility |
| --- | --- |
| `src/lib/battle/golden.test.ts` | Records scripted battles to `api/tests/golden/battles.json` (`UPDATE_GOLDEN=1`) |
| `api/app/engine/types.py` | `TypedDict`s mirroring `Pokemon`, `Move`, `Stats`, `Fighter`, `BattleState`, events, `VersusState` |
| `api/app/engine/type_chart.py` | `effectiveness(move_type, defender_types) -> float` |
| `api/app/engine/moves.py` | `moves_for`, `move_category` |
| `api/app/engine/stats.py` | stat, HP and XP formulas |
| `api/app/engine/catch.py` | `capture_chance`, `catch_rate`, `shake_checks` |
| `api/app/engine/wild.py` | `create_fighter`, `create_battle`, `calc_damage`, `turn_order`, `wild_level`, `choose_enemy_move`, `resolve_turn`, `send_out`, `strike` |
| `api/app/engine/versus.py` | `create_versus_team`, `resolve_versus_turn`, `versus_send_out`, `battle_view_for`, `events_for`, `clamp_timing`, `standing` |
| `api/tests/engine/` | Unit tests per module, `test_golden_battles.py` |

---

### Task 1: Tables and formulas

**Files:** `types.py`, `type_chart.py`, `moves.py`, `stats.py`, `catch.py`, and `api/tests/engine/test_{type_chart,moves,stats,catch}.py`

**Interfaces:**
- Produces (Python names snake_case; dict keys stay camelCase): `Rng = Callable[[], float]`;
  `effectiveness(move_type: str, defender_types: list[str]) -> float`; `move_category(type_: str) -> Literal["physical",
  "special"]`; `moves_for(types: list[str]) -> list[Move]`; `START_LEVEL = 5`, `MAX_LEVEL = 100`,
  `stat_at(base, level) -> int`, `max_hp_at(base, level) -> int`, `stats_at(creature, level) -> Stats`,
  `xp_for_level(level) -> int`, `level_for_xp(xp) -> int`, `xp_gain(defeated, defeated_level) -> int`;
  `capture_chance(rate, hp, max_hp) -> float`, `catch_rate(creature) -> int`, `shake_checks(chance, rng) -> int`.
  Tables copied verbatim from the TS (18-type chart, the move lists per type).

- [ ] **Step 1:** Port every case in `type-chart.test.ts`, `stats.test.ts`, `catch.test.ts` and the `movesFor` block of
  `engine.test.ts` to pytest, same names in snake_case, same expected values. Add: `catch_rate` for a legendary halves
  then floors; `moves_for(["Normal"])` gives the four Normal moves in order.
- [ ] **Step 2:** Run — FAIL (modules missing).
- [ ] **Step 3:** Implement. Floors use `math.floor` on the same float expressions as the TS.
- [ ] **Step 4:** `uv run pytest -q tests/engine`, ruff, mypy.
- [ ] **Step 5:** Commit — `"Port the battle tables and formulas to Python"`

---

### Task 2: The golden battles

**Files:** `src/lib/battle/golden.test.ts`, `api/tests/golden/battles.json` (generated), `api/tests/engine/golden.py`
(loader and `assert_same_json`)

The recorder builds each scenario from real records in `src/data/pokemon.json` (by id), wraps a scripted `rng` that
returns the listed numbers in order and counts calls, and records after every step: `{events, state, rngUsed}`.

Scenario format:
```json
{ "name": "...", "kind": "wild" | "versus",
  "setup": { wild: { "party": [{"id": 4, "level": 12, "hp": null, "xp": 0}], "enemy": {"id": 9, "level": 11} }
             versus: { "host": [ids], "guest": [ids] } },
  "steps": [ { "call": "resolveTurn" | "sendOut" | "resolveVersusTurn" | "versusSendOut",
               "args": {...}, "rng": [0.31, 0.9, ...],
               "result": { "events": [...], "state": {...}, "rngUsed": 3 } } ] }
```
Fighter `uid`s are fixed strings (`p0`, `p1`, `wild`). Scenarios (exact list):

1. Wild: move turn, player faster, both hit, no faint.
2. Wild: speed tie broken each way (two steps).
3. Wild: a critical hit; a miss; an immune target (0 damage).
4. Wild: timing bonus 1.25 on the player's move.
5. Wild: enemy faints → `winner: player`, XP, a level-up (pick levels so the XP crosses a level).
6. Wild: the player's active faints → `mustSwitch`, then `sendOut`; then the last one faints → blackout.
7. Wild: switch turn (enemy attacks the new creature).
8. Wild: catch fails at 2 shakes then enemy attacks; catch succeeds at 4.
9. Wild: `chooseEnemyMove` random branch (rng ≥ 0.7).
10. Wild: `wildLevel` for team levels [5, 6] (average 5.5 → JS rounds to 6) with offsets −2 and +2, recorded as a
    `call: "wildLevel"` step.
11. Versus: both move, speed decides order, a faint mid-turn stops the second attack.
12. Versus: one switches, the other moves; then a faint → `versusSendOut`.
13. Versus: final faint → winner; `battleViewFor` and `eventsFor` recorded for both seats.
14. Versus: `clampTiming` for `"x"`, `NaN` → 1, `0.5` → 1, `2` → 1.25, `1.1` → 1.1 (a `call: "clampTiming"` step).

`assert_same_json(actual, expected)`: recursive equality that also requires `type(a) is type(b)` for numbers (int vs
float) and the same dict keys.

- [ ] **Step 1:** Write the recorder; run without the file — FAIL; generate with `UPDATE_GOLDEN=1`; run again — PASS.
  Check by eye that scenario 5 contains a `levelUp` event, 6 a `blackout`, 8 `shakes: 4`, 10 levels `[4, 8]`.
- [ ] **Step 2:** Write `golden.py` with a unit test for `assert_same_json` (`{"a": 24}` vs `{"a": 24.0}` fails).
- [ ] **Step 3:** `pnpm lint && pnpm test`; `uv run pytest -q`.
- [ ] **Step 4:** Commit — `"Record scripted battles from the TypeScript engine"`

---

### Task 3: Wild battles

**Files:** `api/app/engine/wild.py`, `api/tests/engine/test_wild.py`, `api/tests/engine/test_golden_battles.py`

**Interfaces:**
- Consumes: Task 1.
- Produces: `create_fighter(creature: Pokemon, level: int, *, uid: str, hp: int | None = None, xp: int | None = None)
  -> Fighter`; `create_battle(party: list[Fighter], enemy: Fighter) -> BattleState`; `calc_damage(attacker, defender,
  move, roll, crit=False, bonus=1.0) -> tuple[int, float]`; `turn_order(player_speed, enemy_speed, rng) ->
  tuple[Side, Side]`; `wild_level(levels: list[int], rng) -> int`; `choose_enemy_move(enemy, target, rng) -> int`;
  `resolve_turn(state, action: PlayerAction, rng) -> TurnResult`; `send_out(state, to: int) -> TurnResult`;
  `strike(...)`. `TurnResult = TypedDict("TurnResult", {"events": list[BattleEvent], "state": BattleState})`.
  Errors the TS throws become `ValueError` with the same message.

`js_round(x) = math.floor(x + 0.5)` for `Math.round`, with a comment.

- [ ] **Step 1: Write the failing tests:** port `engine.test.ts` blocks `baseDamage`, `calcDamage`, `turnOrder`,
  `chooseEnemyMove`, `wildLevel`, `resolveTurn` (same scripted numbers, same expectations); add
  `test_resolve_turn_leaves_input_unchanged` (deep-copy before, compare after) and `test_js_round_half_up`
  (`wild_level([5, 6], rng=0.5→offset 0) == 6`). `test_golden_battles.py` replays every `kind: "wild"` scenario and the
  `wildLevel` step: build the setup from `pokemon.json`, call the function with a scripted rng, `assert_same_json`
  the result, and assert the rng was called exactly `rngUsed` times.
- [ ] **Step 2:** Run — FAIL.  **Step 3:** Implement.  **Step 4:** `uv run pytest -q`, ruff, mypy.
- [ ] **Step 5:** Commit — `"Port wild battles to Python"`

---

### Task 4: Friend battles

**Files:** `api/app/engine/versus.py`, `api/tests/engine/test_versus.py`

**Interfaces:**
- Produces: `VERSUS_LEVEL = 50`, `NO_BAR_BONUS = 1.125`, `MAX_TIMING = 1.25`; `other_seat(seat)`;
  `clamp_timing(value: object) -> float`; `create_versus_team(creatures, seat) -> VersusTeam`; `standing(team) -> int`;
  `battle_view_for(state, seat) -> BattleState`; `events_for(events, seat) -> list[BattleEvent]`;
  `resolve_versus_turn(state, actions: dict[Seat, VersusAction], rng) -> VersusTurnResult`;
  `versus_send_out(state, seat, to) -> VersusTurnResult`.

`clamp_timing`: non-number or NaN → 1; else clamp to [1, 1.25]. `bool` is not a number here (Python's `True` is an
`int`; JS `typeof true` is not `number`).

- [ ] **Step 1:** Port `versus.test.ts`; extend the golden replay to `kind: "versus"` and `clampTiming`; add
  `clamp_timing(True) == 1`.
- [ ] **Step 2:** FAIL.  **Step 3:** Implement.  **Step 4:** `uv run pytest -q`, ruff, mypy; `pnpm test`.
- [ ] **Step 5:** Commit — `"Port friend battles to Python"`

---

### Task 5: Docs and walkthrough

- [ ] **Decisions:** state as camelCase `TypedDict`s identical to the TS JSON (rejected: snake_case dataclasses plus
  a conversion layer, two shapes to keep in sync); parity by recorded battles with exact random numbers (rejected:
  porting unit tests only); `js_round` instead of `round`; the TS engine stays until slice 4 switches the client.
- [ ] **Interview questions (🔴):** how do you know the Python engine plays identically; why inject `rng`; why the
  order of random draws matters; banker's rounding; why the engine never mutates its input; why plain dicts instead of
  classes.
- [ ] **Commit, push, PR**; CI green. **Owner merges.**
- [ ] **Walkthrough (owner):** step through golden scenario 1 in the debugger: `resolve_turn` → `choose_enemy_move`
  → `turn_order` → two `strike`s, naming each random number as it's drawn.
