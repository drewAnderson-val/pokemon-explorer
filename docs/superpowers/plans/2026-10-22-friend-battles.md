# Friend Battles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two players battle each other online through a shared link, each on their own mirrored Pocket Explorer handheld.

**Architecture:** Pure two-team rules (`src/lib/battle/versus.ts`) reuse the wild engine's damage, accuracy and turn
order. An in-memory match store (`server/matches.ts`) owns every match, runs the rules with server randomness and
turns state into per-player views. An Express router streams those views over Server-Sent Events and takes actions
by `POST`. The client renders views with the existing scene, script and flow reducer.

**Tech Stack:** TypeScript strict, React 19, Express 5, Vitest + Testing Library, Pulumi (infra only).

**Spec:** `docs/superpowers/specs/2026-10-22-friend-battles-design.md`

## Global Constraints

- Lint is strict (`pnpm lint`): no semicolons, single quotes, no trailing commas, `perfectionist` import order,
  `no-console` allows only `debug`/`warn`/`error`.
- Every creature in a friend match fights at **Lv50**, full HP. Nothing from a match is written to the saved team.
- Teams: **1–6** creature IDs from `src/data/pokemon.json`. Creature Lab (custom) creatures can't be used.
- Timing multiplier is clamped server side to **1–1.25**; non-numbers count as 1. Reduced motion sends **1.125**.
- In a friend match the timing bar runs regardless of the Timing setting (reduced motion excepted).
- Disconnect forfeit: **60 s**, battle phase only. Unstarted matches expire **30 min** after creation; finished ones
  are dropped **10 min** after ending.
- Match creation: **20/hour** per client (`createWindowLimiter`), at most **500** matches held at once.
- Seat tokens live in `sessionStorage` (per tab), never `localStorage`.
- The opponent's team is never sent to a player before the battle starts. After it starts, only their active
  creature and a count of creatures still standing.
- Match IDs: 8 chars from `abcdefghjkmnpqrstuvwxyz23456789`; tokens: 32 random bytes, base64url. Both from
  `node:crypto`.
- The wild battle keeps its behaviour and all its tests.
- **Deviation from spec, decided here:** the events stream never answers with an HTTP error (an `EventSource` can't
  read the status). It answers `200` and sends one `gone` event for an unknown/expired match or a bad token, then
  ends. The `POST` routes keep the spec's status codes.

## Review Focus

1. **A view arrives while messages are still playing** (opponent acted fast): the turn must queue and play after the
   current messages, never be dropped by `flowReducer`'s phase check. Test in Task 7.
2. **Reloading the tab mid-battle**: the same token reconnects, the screen shows the current state and does not
   replay old turns. Tests in Tasks 4 and 7.
3. **Opening the link in a third tab once both seats are taken** shows "This match is already full." Test in Task 6.
4. **Double submit** (two quick clicks, or a click after acting): the server answers `409` and nothing changes; the
   menu is disabled once an action is sent. Tests in Tasks 3 and 7.
5. **A KO followed by the opponent's send-out**: the player who scored the KO waits with "Waiting for your friend…"
   and then sees the new creature arrive. Tests in Tasks 1 and 7.

---

### Task 1: Two-team rules

**Files:**
- Create: `src/lib/battle/versus.ts`
- Modify: `src/lib/battle/engine.ts` (add `side?: Side` to the `switch` event and `versus?: boolean` to
  `BattleState`; types only)
- Test: `src/lib/battle/versus.test.ts`

**Interfaces:**
- Consumes: `calcDamage`, `hits`, `rollFrom`, `turnOrder`, `createFighter`, `CRIT_CHANCE`, `BattleEvent`,
  `BattleState`, `Fighter`, `Rng`, `Side` from `engine.ts`.
- Produces:
  ```ts
  export type Seat = 'guest' | 'host'
  export type VersusTeam = { active: number; mustSwitch: boolean; party: Fighter[] }
  export type VersusState = { guest: VersusTeam; host: VersusTeam; winner: null | Seat }
  export type VersusAction =
    | { index: number; timing: number; type: 'move' }
    | { to: number; type: 'switch' }
  export const VERSUS_LEVEL = 50
  export const NO_BAR_BONUS = 1.125
  export const MAX_TIMING = 1.25
  export const otherSeat: (seat: Seat) => Seat
  export function clampTiming(value: unknown): number
  export function createVersusTeam(creatures: Pokemon[], seat: Seat): VersusTeam   // uids `${seat}-${i}`
  export function resolveVersusTurn(state: VersusState, actions: Record<Seat, VersusAction>, rng: Rng):
    { events: BattleEvent[]; state: VersusState }
  export function versusSendOut(state: VersusState, seat: Seat, to: number):
    { events: BattleEvent[]; state: VersusState }
  export function standing(team: VersusTeam): number            // fighters with hp > 0
  export function battleViewFor(state: VersusState, seat: Seat): BattleState
  export function eventsFor(events: BattleEvent[], seat: Seat): BattleEvent[]
  ```
  Events are written from the **host's** side (`player` = host, `enemy` = guest); `eventsFor(events, 'guest')`
  swaps every `side`/`target`. `battleViewFor` returns `{ active, party, mustSwitch }` of the seat's team,
  `enemy` = the other team's active fighter, `winner` mapped to `player`/`enemy`, `caught: false`, `versus: true`.

- [ ] **Step 1: Write the failing tests** (`versus.test.ts`, creatures taken from `pokemon.json` by id; `rng`
  scripted)
  - `createVersusTeam` puts every fighter at level 50 and full HP, `active` 0, uids `host-0`, `host-1`.
  - `clampTiming(2)` → 1.25, `clampTiming(0.5)` → 1, `clampTiming('x')` → 1, `clampTiming(1.1)` → 1.1.
  - Both move: the faster active fighter's `move` event comes first (pick two creatures whose Lv50 speeds differ and
    assert against `statsAt`); with `rng = () => 0` both hit; the input state is not mutated.
  - A switch goes before the opponent's move: events start with `{ type: 'switch', side: 'enemy' }` when the guest
    switches, and the host's move then damages the new guest fighter.
  - A faint stops the turn: the fainted seat gets `mustSwitch: true`, the other fighter doesn't act after it, and
    `winner` stays `null` while that team has someone standing.
  - The last fighter fainting sets `winner` to the other seat.
  - `resolveVersusTurn` returns no events and the same state when either team `mustSwitch` or there's a winner.
  - `versusSendOut` throws for a fainted or active target; on success clears `mustSwitch` and emits a `switch` event
    with `from: null` and the seat's side.
  - `eventsFor(events, 'guest')` swaps `side`/`target`; `battleViewFor(state, 'guest').enemy` is the host's active
    fighter and `.winner` is `'player'` when the guest won.
  - `timing` multiplies only that seat's damage (same `rng`, 1.25 vs 1 → larger `amount`).

- [ ] **Step 2: Run them and see them fail**
  Run: `pnpm vitest run src/lib/battle/versus.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement `versus.ts`** and the two `engine.ts` type additions. Copy-on-write like `engine.ts`'s
  `draft`. Turn: switches first (host, then guest); then the seats that chose moves, in `turnOrder(hostSpeed,
  guestSpeed, rng)` order; stop after any faint. Damage via `calcDamage` with `bonus: clampTiming(timing)`, `crit`
  from `rng() < CRIT_CHANCE`, `roll: rollFrom(rng)`, misses via `hits`. No XP, no catching, no `blackout` event.

- [ ] **Step 4: Run** `pnpm vitest run src/lib/battle` — Expected: PASS (wild engine tests too).

- [ ] **Step 5: Commit** `git commit -m "Add two-team battle rules for friend matches"`

---

### Task 2: Messages for a friend match

**Files:**
- Modify: `src/lib/battle/script.ts`
- Test: `src/lib/battle/script.test.ts`

**Interfaces:**
- Consumes: `BattleState.versus`, the `switch` event's `side` (Task 1).
- Produces: unchanged signatures; `displayName`, `introSteps`, `stepsFor` read `state.versus`.

- [ ] **Step 1: Write the failing tests** (add to `script.test.ts`)
  - `displayName({ ...state, versus: true }, 'enemy')` → `Foe X`; without `versus` still `Wild X`.
  - `introSteps` with `versus` → `['Your friend sent out X!', 'Go! Y!']`.
  - A `switch` event with `side: 'enemy'`, `from: null` → step `{ show: { side: 'enemy', … }, text: 'Your friend
    sent out X!' }`; with `from: 'A'` → `'Your friend withdrew A and sent out X!'`.
  - A `switch` event with no `side` still shows on `player` (wild battle unchanged).

- [ ] **Step 2: Run** `pnpm vitest run src/lib/battle/script.test.ts` — Expected: FAIL on the new cases.

- [ ] **Step 3: Implement** the three branches in `script.ts`.

- [ ] **Step 4: Run** `pnpm vitest run src/lib/battle` — Expected: PASS.

- [ ] **Step 5: Commit** `git commit -m "Name the foe and their send-outs in friend battles"`

---

### Task 3: Match store

**Files:**
- Create: `src/lib/versus-api.ts` (wire types only in this task)
- Create: `server/matches.ts`
- Test: `server/matches.test.ts` (`// @vitest-environment node`)

**Interfaces:**
- Consumes: Task 1's `versus.ts`; `Pokemon` from `src/lib/pokemon`.
- Produces, in `src/lib/versus-api.ts`:
  ```ts
  export type MatchAction =
    | { creatureIds: number[]; type: 'team' }
    | { index: number; timing: number; type: 'move' }
    | { to: number; type: 'switch' }
    | { to: number; type: 'sendOut' }
    | { type: 'forfeit' }
  export type MatchOutcome = { reason: 'forfeit' | 'knockout' | 'left'; winner: 'them' | 'you' }
  export type MatchView = {
    acted: boolean                 // you've chosen this turn's action
    battle: BattleState | null     // from your side; null before the battle
    events: BattleEvent[]          // the turn that produced `battle`, from your side
    opponent: { acted: boolean; connected: boolean; joined: boolean; ready: boolean; standing: number; switching: boolean }
    outcome: MatchOutcome | null
    phase: 'battle' | 'over' | 'picking' | 'waiting'
    ready: boolean                 // your team is locked in
    turn: number                   // 0 until the battle starts; +1 per resolved turn or send-out
    you: Seat
  }
  ```
  In `server/matches.ts`:
  ```ts
  export type MatchListener = { close: () => void; send: (view: MatchView) => void }
  export type ActResult = { ok: true } | { error: string; ok: false; status: 400 | 404 | 409 }
  export function createMatchStore(options: {
    creatures: ReadonlyMap<number, Pokemon>; maxOpen: number; now?: () => number; rng?: Rng
  }): {
    act(id: string, token: string, action: unknown): ActResult
    create(): { matchId: string; token: string } | null          // null at maxOpen
    join(id: string): { ok: true; token: string } | { ok: false; status: 404 | 409 }
    size(): number
    subscribe(id: string, token: string, listener: MatchListener): (() => void) | null  // null: gone/bad token
    sweep(): void
  }
  export const DISCONNECT_MS = 60_000, UNSTARTED_MS = 30 * 60_000, FINISHED_MS = 10 * 60_000
  ```

- [ ] **Step 1: Write the failing tests** (fake clock `let t = 0; now: () => t`, `rng: () => 0`, creatures from
  `pokemon.json`)
  - `create` → 8-char id from the allowed alphabet, a token; the 501st `create` with `maxOpen: 500` → `null`.
  - `join` → token; second `join` → `{ ok: false, status: 409 }`; unknown id → `404`.
  - Subscribing sends the current view at once: host sees `phase: 'waiting'`, then `'picking'` after the guest joins
    (both listeners receive it).
  - `team` validation → `400` for `[]`, 7 ids, a non-integer, an id not in the map; `409` when already ready.
  - Before both are ready the view has `battle: null` and the opponent's ids appear nowhere in it
    (`JSON.stringify(view)` contains no `creatureId`s of theirs).
  - Both ready → `phase: 'battle'`, `turn: 1`, `events: []`, each `battle.party` is that seat's team at Lv50.
  - One `move` → that seat's `acted: true`, opponent's `opponent.acted: true`, `turn` unchanged; the second → `turn: 2`
    and both get non-empty `events`; guest events are flipped (`eventsFor`).
  - Acting twice in a turn → `409`; acting while the opponent `mustSwitch` → `409`; move index 9 → `400`; switch to
    the active or a fainted fighter → `400`; `sendOut` when not `mustSwitch` → `409`.
  - After a KO the fainted seat's view has `battle.mustSwitch: true`, the other has `opponent.switching: true`;
    `sendOut` → `turn` +1, both get a `switch` event.
  - Last fighter down → `phase: 'over'`, outcomes `{ winner: 'you', reason: 'knockout' }` / `'them'`.
  - `forfeit` in battle → over with `reason: 'forfeit'`; in `picking` → over too.
  - Disconnect: in `battle`, unsubscribing the guest's only listener, `t += 59_999; sweep()` → still battle and host
    sees `opponent.connected: false`; resubscribing then `t += 60_000; sweep()` → still battle; unsubscribing again
    and `t += 60_000; sweep()` → over, guest `{ winner: 'them', reason: 'left' }`.
  - Before battle, a disconnect never forfeits: unsubscribe in `waiting`, `t += 10 * 60_000; sweep()` → still there.
  - Expiry: unstarted at `t = 30 * 60_000` → `sweep()` removes it (`size()` 0, `subscribe` → `null`); over at
    `FINISHED_MS` later → removed; removal calls each open listener's `close`.
  - A second `subscribe` with the same token closes the first listener (newest stream wins).
  - A bad token → `subscribe` `null`, `act` `404`.

- [ ] **Step 2: Run** `pnpm vitest run server/matches.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement `createMatchStore`.** A `Map<string, Match>`; each seat holds `token`, `team` (ids or
  null), `listeners: Set<MatchListener>` (at most one after the newest-wins rule), `disconnectedAt`, `pending`
  action. Every change calls one `broadcast(match)` that builds each seat's `MatchView` with `battleViewFor` /
  `eventsFor`. `act` parses `action` itself (it's `unknown` from the request body). The battle uses
  `rng ?? Math.random`; ids/tokens use `node:crypto` (`randomInt`, `randomBytes(32).toString('base64url')`).

- [ ] **Step 4: Run** `pnpm vitest run server/matches.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit** `git commit -m "Add the in-memory match store for friend battles"`

---

### Task 4: Match routes and the event stream

**Files:**
- Create: `server/matches-route.ts`
- Modify: `server/app.ts` (mount the router; one store; a `setInterval(store.sweep, 5_000).unref()`; also call
  `sweep()` at the top of each match route)
- Test: `server/matches-route.test.ts` (`// @vitest-environment node`, real server on port 0 like `app.test.ts`)

**Interfaces:**
- Consumes: `createMatchStore` (Task 3), `WindowLimiter` (`server/rate-limit.ts`).
- Produces:
  ```ts
  export function matchesRoute(options: { perClient: WindowLimiter; store: MatchStore }): express.Router
  ```
  Routes: `POST /api/matches` → `201 { matchId, token }`, `429` over the per-client limit (by `req.ip`), `503`
  `{ error: 'Too many open matches. Try again soon.' }` when `create()` is null.
  `POST /api/matches/:id/join` → `200 { token }` / `404` / `409`.
  `POST /api/matches/:id/actions` body `{ token, action }` (`express.json({ limit: '2kb' })`) → `204` or the store's
  status with `{ error }`.
  `GET /api/matches/:id/events?token=…` → `200 text/event-stream` (`Cache-Control: no-cache`,
  `X-Accel-Buffering: no`, `flushHeaders()`); each view as `event: view` + `data: <json>`; `: ping` every 25 s;
  `event: gone` then `end()` when `subscribe` returns null or the listener is closed; unsubscribe on `req` close.

- [ ] **Step 1: Write the failing tests.** A helper `readEvents(url, count)` that `fetch`es the stream, parses
  `event:`/`data:` frames from `res.body` and aborts after `count` frames.
  - create → `201`, then join → `200`, join again → `409`, join `nope` → `404`.
  - The 21st create from one client within the hour → `429`.
  - events with a bad token → status `200`, first frame `gone`.
  - Full flow over HTTP: create, join, both stream; both post `team`; both post `move` index 0 → each stream's latest
    view has `turn: 2`.
  - Reconnect: close the host stream after the battle starts, open it again → its first frame is a `view` with the
    current `turn` (Review Focus 2).
  - actions with a malformed body (`{}`) → `400`.

- [ ] **Step 2: Run** `pnpm vitest run server/matches-route.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** the router and mount it in `app.ts` with
  `createWindowLimiter(20, HOUR)` and `createMatchStore({ creatures: new Map(pokemon.map(p => [p.id, p])), maxOpen: 500 })`.

- [ ] **Step 4: Run** `pnpm vitest run server` — Expected: PASS.

- [ ] **Step 5: Commit** `git commit -m "Serve friend matches over SSE and POST"`

---

### Task 5: Client API and `useMatch`

**Files:**
- Modify: `src/lib/versus-api.ts` (add the fetchers and token helpers)
- Create: `src/hooks/useMatch.ts`
- Test: `src/hooks/useMatch.test.ts`, `src/test/fake-event-source.ts`

**Interfaces:**
- Consumes: the routes from Task 4.
- Produces:
  ```ts
  // versus-api.ts
  export const tokenKey = (matchId: string) => `pokemon-explorer:match:${matchId}`
  export function loadToken(matchId: string): null | string     // sessionStorage, try/catch → null
  export function saveToken(matchId: string, token: string): void
  export async function createMatch(): Promise<{ matchId: string; token: string }>  // throws Error(message) on !ok
  export async function joinMatch(matchId: string): Promise<{ status: 'full' | 'gone' } | { token: string }>
  export async function sendAction(matchId: string, token: string, action: MatchAction): Promise<void>
  export const matchPath = (matchId: string) => `/battle/vs/${matchId}`
  // useMatch.ts
  export type MatchStatus = 'connecting' | 'full' | 'gone' | 'live'
  export function useMatch(matchId: string): {
    send: (action: MatchAction) => Promise<void>; status: MatchStatus; view: MatchView | null
  }
  // fake-event-source.ts
  export class FakeEventSource { static last: FakeEventSource | null; url: string; closed: boolean
    emit(type: 'gone' | 'view', data?: unknown): void; close(): void }
  export function stubEventSource(): typeof FakeEventSource
  ```

- [ ] **Step 1: Write the failing tests**
  - With a saved token, `useMatch('abc')` opens `EventSource('/api/matches/abc/events?token=…')` without calling
    join; a `view` event sets `status: 'live'` and `view`.
  - Without a token it calls join; `{ token }` is saved to `sessionStorage` under `tokenKey('abc')`; a `409` →
    `status: 'full'` and no stream; `404` → `'gone'`.
  - A `gone` event → `status: 'gone'` and the source is closed (no reconnect loop).
  - Unmount closes the source.
  - `send` posts `{ token, action }` to `/api/matches/abc/actions`.

- [ ] **Step 2: Run** `pnpm vitest run src/hooks/useMatch.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement.** Join + connect inside one effect guarded against StrictMode's double run (an
  `ignore` flag; the join `fetch` result is only used if not ignored, and `saveToken` happens before connecting so a
  second run reuses it).

- [ ] **Step 4: Run** the test file — Expected: PASS.

- [ ] **Step 5: Commit** `git commit -m "Add the client side of friend matches"`

---

### Task 6: Friend battle screen, lobby and routing

**Files:**
- Create: `src/components/battle/SettingsToggles.tsx`, `src/components/battle/ConsoleScreen.tsx` (moved out of
  `BattleScreen.tsx` unchanged: `SettingsToggles` and `Screen`, renamed `ConsoleScreen`)
- Modify: `src/screens/BattleScreen.tsx` (use the moved pieces; add a `Battle a friend` link to `/battle/vs` in the
  header next to `HomeLink`)
- Modify: `src/components/battle/TeamPicker.tsx` (new prop `allowCustom?: boolean`, default `true`; `false` drops
  the `custom` tab)
- Create: `src/screens/VersusScreen.tsx`, `src/components/battle/FloatingQuestion.tsx`
- Modify: `src/App.tsx` (`/battle/vs…` before `/battle`; `parseMatchId(pathname): null | string`)
- Test: `src/screens/VersusScreen.test.tsx`, `src/App.test.tsx`

**Interfaces:**
- Consumes: `useMatch`, `createMatch`, `saveToken`, `matchPath` (Task 5); `useTeam` (read only).
- Produces: `export function VersusScreen({ matchId }: { matchId: null | string })`,
  `export function parseMatchId(pathname: string): null | string` (in `VersusScreen.tsx`; 8 chars of the alphabet,
  else null). `VersusArena` (Task 7) is rendered for `phase` `battle`/`over`; until Task 7 lands, a placeholder.

Screens on the handheld, by state:
| State | Shows |
| --- | --- |
| `matchId` null | "Battle a friend" + `Create match` button → `createMatch`, `saveToken`, `history.replaceState` to `matchPath`, then render as host |
| `connecting` | "Connecting…" |
| `full` | "This match is already full." + link to `/battle` |
| `gone` | "This match has ended or expired." + link to `/battle/vs` (`New match`) |
| `waiting`/`picking`, not ready | Host while `!opponent.joined`: the link in a read-only input with `Copy link` (`navigator.clipboard.writeText`, falls back to selecting the input) and "Waiting for a friend…". Then `TeamPicker` with `allowCustom={false}`, local team state seeded once from the saved team; `onStart` sends `team` with the ids. Above it a strip with `FloatingQuestion` labelled "Your friend's team is a secret" |
| ready, opponent not | Big `FloatingQuestion` + "Waiting for your friend to pick…" |

`FloatingQuestion`: a `?` that bobs (CSS keyframe; static under `prefers-reduced-motion`), `aria-label` from props.

- [ ] **Step 1: Write the failing tests** (stub `fetch` and `EventSource`; emit views by hand)
  - `parseMatchId('/battle/vs/abcd2345')` → `'abcd2345'`; `'/battle/vs'` and `'/battle/vs/../x'` → `null`.
  - App routes `/battle/vs/abcd2345` to the versus screen and `/battle` still to the wild battle.
  - No id → `Create match` → POST `/api/matches`, URL becomes `/battle/vs/<id>`, token in `sessionStorage`.
  - Host waiting view → the share input holds `http://localhost/battle/vs/<id>`; `Copy link` calls the clipboard.
  - Picking: no `Custom` tab; toggling a creature doesn't change `localStorage`'s saved team; START posts
    `{ type: 'team', creatureIds: [...] }`.
  - Ready view → "Waiting for your friend to pick…" and the "?" is present.
  - Join answering `409` → "This match is already full." (Review Focus 3); a `gone` event → "This match has ended
    or expired."
  - The wild Battle header has a `Battle a friend` link to `/battle/vs`.

- [ ] **Step 2: Run** `pnpm vitest run src/screens src/App.test.tsx` — Expected: new tests FAIL, existing pass.

- [ ] **Step 3: Implement** the moves, the prop, the screen and routing.

- [ ] **Step 4: Run** `pnpm vitest run` — Expected: PASS (all wild battle tests unchanged).

- [ ] **Step 5: Commit** `git commit -m "Add the friend battle lobby and team picking"`

---

### Task 7: Friend battle arena

**Files:**
- Create: `src/components/battle/VersusArena.tsx`
- Modify: `src/lib/battle/flow.ts` (export `ACTING`), `src/screens/VersusScreen.tsx` (render the arena)
- Test: `src/components/battle/VersusArena.test.tsx`

**Interfaces:**
- Consumes: `MatchView`, `MatchAction` (Task 3); `startFlow`, `flowReducer`, `currentStep`, `ACTING` (flow.ts);
  `BattleScene`, `BattleMenu`, `TimingBar`, `DialogBox`; `NO_BAR_BONUS` (Task 1).
- Produces: `export function VersusArena({ onNewMatch, send, view }: { onNewMatch: () => void;
  send: (action: MatchAction) => Promise<void>; view: MatchView })`

Behaviour the tests pin:
- The flow starts from `startFlow(view.battle)` and an `applied` ref set to `view.turn` at mount, so a reload shows
  the current state without replaying (Review Focus 2).
- An effect applies a newer `view.turn` with `dispatch({ type: 'resolved', events: view.events, state: view.battle })`
  only when `ACTING.includes(flow.phase)`; otherwise it waits for the phase to come back (Review Focus 1).
- Menu: Fight, Team, Forfeit. Disabled, with the prompt "Waiting for your friend…", while `view.acted`, while
  `opponent.switching`, or while a send is in flight (Review Focus 4, 5). "Waiting for your friend to reconnect…"
  replaces it when `!opponent.connected` in battle.
- Moves: timing bar unless reduced motion; reduced motion sends `timing: NO_BAR_BONUS`. A forced switch sends
  `sendOut`, a menu switch sends `switch`.
- End: after the knockout messages (`flow.phase === 'end'`), or at once when `outcome.reason` isn't `knockout`.
  Copy: won → "You won!" / "Your friend is out of creatures."; lost → "You lost…" / "You're out of creatures.";
  forfeit → "Your friend forfeited." or "You forfeited."; left → "Your friend left the battle." Buttons:
  `New match` (`onNewMatch`, goes to `/battle/vs`) and Home.

- [ ] **Step 1: Write the failing tests** (render with a view built from `createVersusTeam` + `battleViewFor`;
  reduced motion stubbed like `BattleScreen.test.tsx`; advance messages until a prompt)
  - Intro: "Your friend sent out X!" then "Go! Y!", then "What will Y do?".
  - Picking a move sends `{ type: 'move', index: 0, timing: 1.125 }` and the menu shows "Waiting for your friend…";
    a second click sends nothing.
  - A new view with `turn + 1` and events plays "Y used …!" messages and returns to the menu.
  - A view that arrives mid-messages is played after them (both turns' messages appear, in order).
  - Mounting with `turn: 5` shows no turn messages before the prompt.
  - Opponent `switching: true` → menu disabled with "Waiting for your friend…"; the following send-out view shows
    "Your friend sent out Z!".
  - `Forfeit` sends `{ type: 'forfeit' }`; an `over` view with `{ winner: 'them', reason: 'left' }` shows "Your
    friend left the battle." straight away.
  - `!opponent.connected` → "Waiting for your friend to reconnect…".

- [ ] **Step 2: Run** `pnpm vitest run src/components/battle/VersusArena.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement** the arena, reusing `BattleArena`'s focus, keyboard-advance and sound effects pattern
  (copy the small effects rather than generalising `BattleArena`; the wild arena stays untouched).

- [ ] **Step 4: Run** `pnpm vitest run` — Expected: PASS.

- [ ] **Step 5: Commit** `git commit -m "Add the friend battle arena"`

---

### Task 8: Infra, decisions and end-to-end check

**Files:**
- Modify: `infra/index.ts` (`maxInstanceCount: 1` for prod, with a comment: matches live in memory)
- Modify: `docs/decisions.md` (a `2026-10-22: Friend battles` entry: what, why, rejected, from the spec's tables,
  plus the `gone`-event deviation), `README.md` (a short "Battle a friend" section, no new media),
  `docs/ai-usage.md` if it lists features
- Test: none new; full verification

- [ ] **Step 1: Edit** the three files.

- [ ] **Step 2: Verify the app**
  Run: `pnpm lint && pnpm test && pnpm build` — Expected: all pass, no lint output.

- [ ] **Step 3: Verify infra**
  Run: `cd infra && pnpm install && pnpm types` — Expected: no errors.

- [ ] **Step 4: Two tabs end to end**
  Run `pnpm start`, then in two tabs of one browser: tab 1 `/battle` → `Battle a friend` → `Create match`; paste
  the link in tab 2; pick different teams; play to a knockout; reload one tab mid-battle (it resumes); open the link
  in a third tab ("already full"). Expected: every step as described, no console errors.

- [ ] **Step 5: Commit** `git commit -m "Cap Cloud Run at one instance and record the friend battle decisions"`
