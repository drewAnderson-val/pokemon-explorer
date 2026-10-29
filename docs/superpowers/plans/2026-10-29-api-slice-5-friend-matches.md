# API slice 5: friend battles on the server — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Friend matches move from Express's in-memory `Map` (`server/matches.ts`) to Postgres and FastAPI. Two signed-in
players, simultaneous turns, live updates to both, correct when both act at once, when a request is retried, when a
player disappears, and when the two players are connected to different server instances.

**Architecture:** Two PRs, like slice 4.
- **5a, API only:** a `matches` row per match (state as the engine's JSONB), seats are user ids. Actions run in a
  transaction that locks the row (`SELECT … FOR UPDATE`), stores the seat's pending action, and resolves the turn with
  the slice 3 engine once both are in. Moves carry an `Idempotency-Key`; a retry replays the stored answer. Each
  instance keeps one Postgres `LISTEN` connection; after every committed change the route sends `NOTIFY` with the match
  id, and every instance pushes fresh per-seat views to the SSE streams it holds. A sweep on each instance marks seats
  away, forfeits players gone 60 s, and deletes expired matches, with idempotent SQL so two instances sweeping at once
  is harmless.
- **5b, the frontend switch:** `useMatch` creates, joins and acts through the API with the account's token; the
  stream authenticates with the JWT (`?token=`); `/battle/vs` requires sign-in. Express's match code stays until the
  slice 8 cutover.

**Tech Stack:** FastAPI (`StreamingResponse` for SSE), psycopg 3 async (`conn.notifies()`), the slice 3 engine
(`app/engine/versus.py`), React.

**Spec:** `docs/superpowers/specs/2026-10-26-fastapi-backend-design.md` (Data model `matches`, `match_actions`;
"Friend matches"; Slices: 5). Decisions: "Concurrent moves use row locking", "No message broker yet". Behavior
reference: `server/matches.ts`, `server/matches-route.ts` and their tests.

## Global Constraints

- Same rules and timings as `server/matches.ts`: phases `waiting → picking → battle → over`; outcome `knockout |
  forfeit | left`; `AWAY_GRACE` 5 s, `DISCONNECT` 60 s (counted from the later of the drop and the battle's start),
  unstarted matches deleted after 30 min, finished after 10 min; ids of 8 chars from `abcdefghjkmnpqrstuvwxyz23456789`;
  teams 1–6 catalog creatures; the opponent's team hidden until the battle.
- The per-seat view is exactly the TypeScript `MatchView` (`src/lib/versus-api.ts`), so `VersusArena` doesn't change.
- A seat is a user id from the token, never from the request. A user who isn't in a match gets 404 for it.
- Every write to a `matches` row happens in a transaction that reads it with `FOR UPDATE` first.
- Limits: 20 new matches per user per hour, 500 open matches overall, 2 KB action bodies.
- No new infrastructure: no Redis, no broker. `LISTEN/NOTIFY` on the existing Cloud SQL instance.

## Review Focus

1. **Both players act in the same instant.** Exactly one request resolves the turn; neither move is lost; no
   "both waiting forever". (Task 3: two threads, repeated 20 times.)
2. **A retried move.** The same `Idempotency-Key` twice applies once and returns the same answer; the same key for a
   different action body is a 409, not a silent replay. (Task 3.)
3. **Players on different instances.** An action handled by instance A reaches a stream held by instance B. (Task 4:
   two app instances on one database.)
4. **A stream for a token that expires or a user who isn't in the match** gets the `gone` event (EventSource can't
   read a status), never another player's view. (Task 4.)
5. **Two instances sweeping at once.** A forfeit happens once, with one notification, and a finished match isn't
   forfeited again. (Task 5.)

---

## Phase 5a: API

### Task 1: Tables

**Files:** `api/app/db/migrations/0005_matches.sql`, `api/tests/test_matches_schema.py`

```sql
matches (id text PRIMARY KEY CHECK (id ~ '^[a-hjkmnp-z2-9]{8}$'),
         host_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
         guest_id uuid REFERENCES users ON DELETE CASCADE CHECK (guest_id <> host_id),
         host_team int[], guest_team int[], host_pending jsonb, guest_pending jsonb,
         state jsonb, events jsonb NOT NULL DEFAULT '[]', turn int NOT NULL DEFAULT 0, outcome jsonb,
         host_seen_at timestamptz, guest_seen_at timestamptz,     -- NULL: no stream open, ever
         host_away boolean NOT NULL DEFAULT true, guest_away boolean NOT NULL DEFAULT true,
         host_left_at timestamptz, guest_left_at timestamptz,     -- when the last stream dropped
         created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz, finished_at timestamptz)
CREATE INDEX matches_host_created ON matches (host_id, created_at);   -- the per-user hourly limit
match_actions (match_id text REFERENCES matches ON DELETE CASCADE, user_id uuid, idempotency_key text,
               request_hash text NOT NULL, status int NOT NULL, created_at timestamptz DEFAULT now(),
               PRIMARY KEY (match_id, user_id, idempotency_key))
```
- [ ] Tests: a bad id is rejected; a host can't be their own guest; deleting a match deletes its actions. RED → GREEN →
  commit `"Add match tables"`.

### Task 2: Create, join and the per-seat view

**Files:** `api/app/matches/{__init__,store,views}.py`, `api/app/routes/matches.py`, `api/tests/test_match_routes.py`

**Interfaces:**
- Produces: `view_for(row, seat, now) -> MatchView` (port of `viewFor` in `matches.ts`: `acted`, `battle` via
  `battle_view_for`, `events` via `events_for`, `opponent{acted, connected (= not away), joined, ready, standing,
  switching}`, `outcome` mapped to you/them, `phase`, `ready`, `turn`, `you`); `phase_of(row)`.
  Routes: `POST /api/matches` → 201 `{"matchId"}` (429 `You've started a lot of matches! Try again later.` past 20/hour;
  503 `Too many open matches. Try again soon.` past 500); `POST /api/matches/{id}/join` → 200 `{"seat": "guest"}`;
  joining again as the guest or host is 200 with your seat (idempotent, so a reload or StrictMode double-run is fine);
  404 `No such match`; 409 `The match is full`; 409 `The match is over`.
- [ ] Tests: create then join from a second user; host re-join → `{"seat": "host"}`; third user → 409; unknown → 404;
  signed out → 401; the 21st create in an hour → 429; `view_for` before the battle hides the opponent's team (only
  `ready`); a golden check: `view_for` on a state built from `server/matches.test.ts`'s first battle scenario matches
  the TS view field for field. RED → GREEN → commit.

### Task 3: Actions: teams, turns, forfeit, under a lock, idempotent

**Files:** `api/app/routes/matches.py`, `api/app/matches/actions.py`, `api/tests/test_match_actions.py`

**Interfaces:**
- Produces: `POST /api/matches/{id}/actions` body `{"action": {...}}` (no `token`: the seat comes from the user), header
  `Idempotency-Key` (required for `move`, `switch`, `sendOut`; optional for `team`, `forfeit`) → 204 or
  `{"error"}` with the same statuses and messages as `matches.ts` `act()` (`A team is 1 to 6 known creature ids`,
  `Your team is already locked in`, `The battle has started`, `You already acted this turn`, `Waiting for a send-out`,
  `Nothing to send out`, `No such move`, `Can't switch to that creature`, `The match is over`, `The battle is not
  running`, `Unknown action`).

In one transaction: lock the row (`FOR UPDATE`), check the idempotency key (`INSERT … ON CONFLICT DO NOTHING
RETURNING`; on conflict: same `request_hash` → return the stored status, different → 409 `That key was used for a
different action`), apply the action exactly as `takeTurn`/`pickTeam` do (store pending; when both are in, call
`resolve_versus_turn` with `app.state.rng`, store state/events, turn + 1, clear pendings; a knockout finishes the match),
store the status, `NOTIFY match_events, '<id>'`, commit. Postgres delivers the notification only after the commit.

- [ ] Tests:
  - both lock in teams → `phase: battle`, both views show `battle`;
  - **simultaneous moves:** two threads post both players' moves at once, 20 rounds: every round resolves exactly
    once (`turn` +1, both pendings cleared, events of two moves);
  - **retry:** the same key twice → one applied action, both answers 204; same key with a different body → 409;
  - a move before both teams → 409 `The battle is not running`; acting twice in a turn → 409;
  - forfeit → `outcome {reason: forfeit}`, the other user wins; acting after → 409;
  - a third user posting to the match → 404;
  - timing outside 1–1.25 is clamped (`timing: 100` deals the same as 1.25).
  RED → GREEN → commit `"Play friend match turns under a row lock, with idempotency keys"`.

### Task 4: Live views over SSE, across instances

**Files:** `api/app/matches/live.py` (the listener and stream registry), `api/app/routes/matches.py` (events route),
`api/app/main.py` (lifespan starts and stops the listener), `api/tests/test_match_live.py`

**Interfaces:**
- Produces: `class LiveMatches` with `async start(database_url)`, `async stop()`, `subscribe(match_id, user_id) ->
  asyncio.Queue[str]`, `unsubscribe(...)`; started in the lifespan on its own autocommit connection running `LISTEN
  match_events`. On a notification it loads the match row and puts each subscribed seat's `view_for` (as an SSE
  `event: view` frame) on that seat's queues; a deleted match gets `event: gone`.
  `GET /api/matches/{id}/events?token=<JWT>` → always 200 `text/event-stream` (EventSource can't read an error
  status): an invalid token or a non-player gets one `event: gone` and the stream ends; a player gets their view at
  once, then each change; a newer stream from the same user replaces the older one, which gets `event: replaced`.
  While a stream is open the route updates its seat's `seen_at` every 2 s and sets `away = false` (with a NOTIFY when
  it flips); when the last stream for a seat closes it sets `left_at`. A `: ping` comment every 25 s keeps proxies from
  closing an idle stream.

- [ ] Tests:
  - a player's stream gets the current view, then a new one after the opponent acts;
  - **two instances:** two `create_app` apps on the same database; the stream is on app B, the action on app A; B's
    stream receives the new view within 2 s;
  - an expired token, a garbage token, and a non-player each get exactly `event: gone`;
  - the opponent's `connected` turns true when the stream opens; a second stream for the same user makes the first get
    `event: replaced`.
  RED → GREEN → commit `"Push live match views over SSE, across instances via LISTEN/NOTIFY"`.

### Task 5: The sweep

**Files:** `api/app/matches/sweep.py`, `api/app/main.py` (a background task every 5 s while the instance is up),
`api/tests/test_match_sweep.py`

**Interfaces:**
- Produces: `async def sweep(conn) -> list[str]` returning the ids it changed (and NOTIFYing them):
  `UPDATE … SET host_away = true WHERE NOT host_away AND host_left_at < now() - 5 s` (and guest);
  forfeit by `left` when a seat's `left_at` (or `started_at`, if later) is 60 s old in a running battle, with
  `outcome IS NULL` in the `WHERE` so it happens once; `DELETE` unstarted matches after 30 min and finished ones after
  10 min. Also run at the start of every match route, like `matches.ts`.
- [ ] Tests (timestamps moved into the past with SQL): away after 5 s; `left` forfeit after 60 s from the later of
  drop and start; a seat that never connected gets the full 60 s from the start; deletion windows; **two sweeps at
  once** (two connections, `asyncio.gather`) forfeit once and return the id once in total. RED → GREEN → commit.

### Task 6: Ship 5a

- [ ] Smoke test: `POST $API_URL/api/matches` without a token → 401. Infra: the API service's Cloud Run request timeout
  raised to 3600 s (SSE streams; the client already reconnects when one ends).
- [ ] Decisions: seats are users (rejected: seat tokens, which worked without accounts); idempotency keys here vs turn
  numbers for wild battles; `LISTEN/NOTIFY` for fan-out (rejected: Redis pub/sub, one more service; sticky sessions,
  which Cloud Run can't guarantee); presence from stream heartbeats in the row; the sweep's idempotent SQL; `?token=`
  on the stream and its trade-off (tokens in access logs; streams outliving a 1-hour token get `gone`).
- [ ] PR, review, owner merges. The live frontend still uses Express's matches.

---

## Phase 5b: the frontend switch

### Task 7: `useMatch` on the API

**Files:** `src/lib/versus-api.ts`, `src/hooks/useMatch.ts`, `src/screens/VersusScreen.tsx`, tests.

- `createMatch()` and `joinMatch()` go through `authFetch` (no seat token returned or stored; `loadToken`,
  `saveToken`, `tokenKey` removed). `sendAction(matchId, action)` adds `Idempotency-Key: crypto.randomUUID()` for
  move, switch and sendOut, generated once per user action and reused by a retry of that action.
- The stream URL is `${API_BASE}/api/matches/${id}/events?token=${session token}`; `gone` while signed in with an
  expired session sends the user to sign in.
- `/battle/vs` and `/battle/vs/<id>` require sign-in (link with `next`), as `/battle` does; the invite link works
  for a signed-out friend: sign in or sign up, come back to the match, join.
- [ ] Tests: create → join → both views; a move sends an `Idempotency-Key`, a retry of the same action reuses it;
  signed out shows the sign-in link with `next=/battle/vs/<id>`; `replaced` and `gone` still show their messages.
  Commit.

### Task 8: Ship 5b

- [ ] Dev check: two browser sessions (two accounts) through the proxy play a match to a knockout, one reloading
  mid-battle. Decisions, interview questions (the race and its fix; idempotency keys; LISTEN/NOTIFY and what it
  doesn't guarantee; why SSE and not WebSockets; presence by heartbeat). PR, review, merge; Claude watches the deploy
  and plays a match on the live site with two accounts.
- [ ] Walkthrough (owner): both players press Attack at the same instant — trace both requests through the lock to one
  resolved turn and the NOTIFY that reaches both streams.
