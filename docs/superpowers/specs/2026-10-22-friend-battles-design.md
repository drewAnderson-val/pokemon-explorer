# Friend battles: design

Date: 2026-10-22. Builds on the battle screen and team rules (`docs/superpowers/specs/2026-10-15-*`).

## Goal

Two people battle each other online. One player opens a match on Battle and sends a link; the friend opens it, both
choose their creatures on the Pocket Explorer handheld, and they fight turn by turn until one team is knocked out.

Success: a reviewer can play both sides alone in two tabs of the same browser, and two people on different devices can
play against the deployed app. Each sees the same battle from their own side.

## Decided in chat (owner)

| Topic | Choice |
| --- | --- |
| Where | Online, separate devices (or two tabs). |
| Finding each other | The host sends a friend a link. No matchmaking with strangers. |
| What each player sees | The same handheld, mirrored: your creature at the bottom with the menu, theirs at the top. |
| Before the fight | Each player chooses their own creatures ("choose your explorer"), up to 6. |
| Who plays first | Reviewers testing with two tabs, and real friends. Both must work. |
| Opponent's team | Hidden until the battle starts. While picking, the opponent's spot on the handheld shows a floating question mark. |

## Decided by Claude (owner said "pick your choice")

Each of these is mine, not the owner's. Each one changes something in the code, and they're listed so a reviewer can
push back.

| Topic | Choice | Rejected |
| --- | --- | --- |
| Turns | Both players pick an action. When both have picked, the server resolves the turn: switches first, then moves in speed order (existing `turnOrder`, tie = coin flip). The turn stops when a creature faints, as now. | Alternating turns: unlike the games, and it halves the pace. |
| Timing bar | Stays. Each player stops their own bar after choosing a move; the client sends the multiplier, the server clamps it to the existing 1–1.25 range. | Dropping it: it's the battle's signature. Server-timed bar: needs latency compensation. |
| Levels | Every creature fights at **Lv50** at full HP. Nothing from the match is saved to the saved team (no HP loss, no XP). | Saved levels: a friend new to the app (Lv5 team) would be stomped, and the server would have to trust client-sent levels. |
| Menu | FIGHT, TEAM (switch), FORFEIT. No CATCH. Forfeit ends the match as a loss. | |
| Winning | Knock out every creature on the other team. | |
| Fainting | The player whose creature fainted sends out another (free, as now); the other player waits. | |
| Who's who | Each player gets a secret seat token, kept in `sessionStorage` (per tab, so two tabs are two players). | `localStorage`: both tabs would be the same player. Accounts: out of scope. |
| Team picking | Reuse `TeamPicker` (it already browses the whole catalogue), but the selection is local to the match. It starts from the saved team and changes to it are **not** saved back, so two tabs can pick different teams without overwriting each other. | Editing the saved team: two tabs share it. |
| Server authority | The server holds the battle state and runs the rules with its own `Math.random`. Clients send intents only. | Peer-to-peer or client-resolved turns: either side could cheat, and two clients would need the same RNG. |
| Transport | Server-Sent Events (`GET`) for updates, plain `POST` for actions. Express needs nothing new; `EventSource` reconnects on its own. | WebSockets: a new dependency, and nothing here needs client→server streaming. Polling: laggy or chatty. |
| Storage | In memory on the server. No database. | Redis or Firestore: correct for scale-out, over-engineering for a take-home. |
| Scale | Prod Cloud Run `maxInstanceCount` goes from 3 to **1** (`infra/index.ts`), so both players always reach the server holding their match. | Session affinity: two different players can still land on different instances. |
| Disconnects | **During the battle only:** if a player's stream drops, they have **60 s** to come back (same tab, same token) before it counts as a forfeit. The opponent sees "Waiting for your friend to reconnect…". **Before the battle** (host waiting, both picking) a dropped stream forfeits nothing: phones suspend the host's tab while they send the link. The seat stays with its token; the other player sees "Waiting for your friend…". | Forfeit from the start: the host would lose while sharing the link. |
| Timing bar fairness | In a friend match the bar always runs for both players, ignoring the Timing setting. A player with reduced motion gets a fixed ×1.125 (the middle of the range) instead of the bar. | Accepting the gap: turning the bar off would cost up to 25% damage. Host's choice for both: still penalises reduced motion. |
| Expiry | A match that hasn't started its battle expires **30 min** after creation (whether or not a guest joined); a finished match is dropped after 10 min. A sweep removes expired matches. | |
| Abuse | Match creation is rate limited per client with the existing `createWindowLimiter` (e.g. 20/hour), and the server caps open matches (e.g. 500). | |

## How a match goes

1. **Host:** on Battle (`/battle`), a new "Battle a friend" option creates a match (`POST`) and shows a link to copy
   (`/battle/vs/<matchId>`) plus "Waiting for a friend…" on the handheld. The host then picks a team.
2. **Friend:** opens the link. If the guest seat is open, they claim it and pick a team. If it's taken: "This match is
   already full." If it's gone: "This match has expired." Both offer a link back to Battle.
   While picking, the top of the screen (where the opponent will stand) shows a floating **?**: you never see the
   other team, or how many they picked, until the battle starts. The server doesn't send it.
3. **Ready:** each player presses START in the picker. When both are ready, the battle begins on both screens with an
   intro message such as "[Friend's lead] wants to battle!".
4. **Turns:** pick FIGHT → move → stop the timing bar; or TEAM → switch. Then "Waiting for [friend]…" until the
   server resolves the turn, and both screens play the same messages from their own side.
5. **End:** "You won!" / "You lost…" / "[friend] forfeited." The end screen offers "New match" (a new link) and Home.
   No rematch in this version.

Players show up in messages by their lead creature's name (no usernames): "Your friend sent out X!" style text is up
to the builder.

## API (in `server/app.ts`, alongside the existing routes)

| Route | Does |
| --- | --- |
| `POST /api/matches` | Creates a match. Returns `{ matchId, token }` (host seat). Rate limited. |
| `POST /api/matches/:id/join` | Claims the guest seat. Returns `{ token }`; `409` if full, `404` if unknown or expired. |
| `GET /api/matches/:id/events?token=…` | SSE stream of this player's view (see below). `EventSource` can't set headers, so the token is a query parameter. `401` on a bad token. |
| `POST /api/matches/:id/actions` | Body `{ token, action }`. `action` is one of: `team { creatureIds }`, `move { index, timing }`, `switch { to }`, `sendOut { to }`, `forfeit`. `400` for an action that's invalid right now (wrong phase, bad index, fainted target). |

- Match IDs and tokens are random (`crypto.randomBytes`); the ID is short enough to read aloud (e.g. 8 base32 chars),
  the token isn't (e.g. 32 bytes).
- `team` is validated on the server: 1–6 IDs, each in `pokemon.json` (no duplicates required: names repeat anyway,
  the builder decides whether to allow duplicate IDs). Creature Lab cards live only in the browser and **can't** be
  used; the picker hides its custom tab in a friend match.
- Every state change pushes a fresh view to both connected players. A reconnecting stream gets the current view first.

### Per-player view

The server sends each player the match **from their side**: their party as `party`/`active` and the opponent's active
creature as `enemy`, i.e. the existing `BattleState` shape, plus match fields (phase, whether each side has acted,
opponent connected, outcome) and the turn's events with `player`/`enemy` swapped for the guest. That lets the client
reuse `BattleScene`, `script.stepsFor` and most of `flowReducer` with small additions: the `switch` event needs a
`side`, `displayName`/`introSteps` hard-code "Wild X", an enemy faint ends the battle in `engine.ts` (in versus it
means "opponent sends out the next one"), and `Outcome` needs a forfeit case. The opponent's bench is not sent (only how
many are left, for the party balls, if the scene shows them).

## Rules (pure, unit-tested)

A new module (e.g. `src/lib/battle/versus.ts`) holds two-team state and `resolveVersusTurn(state, actions, rng)`,
reusing `calcDamage`, `hits`, `rollFrom`, `turnOrder`, `createFighter` and the event types from `engine.ts`. The
existing wild-battle engine is not refactored. All randomness stays injected so tests can script it. It lives in
`src/lib/` because both the server and the client import it (the client only for types and the view mapping).

## Client

- Routing: `App.tsx` sends `/battle/vs/<id>` to a new friend-battle screen inside the same `Handheld`, with the same
  settings toggles (Classic, full screen) and Home link.
- A friend-battle arena that drives the existing scene and dialog from server views instead of calling
  `resolveTurn` locally. Whether that is a new component or `BattleArena` with an injected "turn source" is up to the
  builder; the wild battle must keep working and keep its tests.
- The wild battle stays as it is.

## Infra

- `infra/index.ts`: prod `maxInstanceCount: 1`.
- Cloud Run closes requests at the service timeout (default 300 s). SSE streams will be cut and `EventSource`
  reconnects; the server must treat a reconnect within the 60 s window as the same player, not a disconnect.
  Raising the timeout is optional.
- `cpuIdle: true` throttles CPU between requests; open SSE streams count as requests, so timers (disconnect,
  expiry) only need to run reliably while a stream is open. The expiry sweep can run lazily on each request.

## Non-goals

- Matchmaking with strangers, usernames, accounts, chat.
- Rematch, spectators, more than two players.
- Turn timers (an idle player can only be forfeited by the other leaving; the other can forfeit).
- Surviving a deploy or restart: matches in progress are lost. The client shows "This match has ended" when the
  server no longer knows the match.
- Custom (Creature Lab) creatures in friend matches.

## Known gaps (accepted)

- The timing-bar multiplier comes from the client, so a player could send 1.25 every time. Bounded by the clamp.
- One instance is a scale ceiling. If this ever needs more, move match state to Redis/Firestore and lift the cap.
- A duplicated browser tab copies `sessionStorage`, so the duplicate acts as the same player. Two streams with one
  token: the newest stream wins.

## Testing

- Unit: `versus.ts` rules (turn order, both moves, faint → send out, win, forfeit, timing clamp) with a scripted `rng`.
- Server: route tests in the style of `server/app.test.ts` (real server on port 0): create/join/full/expired, bad
  token, invalid actions, a full match to a win, reconnect within and after 60 s (with fake timers or an injected
  clock).
- UI: friend-battle screen tests with a fake match stream, in the style of `BattleScreen.test.tsx`.
- Manual: two tabs against `pnpm dev`, then two devices against the deployed app.

## Left to the builder

File and component names, message wording, how the copy-link UI looks on the handheld, the exact rate limits and
caps, whether duplicate creature IDs are allowed in a team, and whether `BattleArena` is generalised or a sibling
component is written.
