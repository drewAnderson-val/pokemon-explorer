# API slice 4: teams and wild battles on the server — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in user's team lives in Postgres, and wild battles are played by the server: the browser sends
each action and plays back the events the API returns. Battle and team features require sign-in.

**Architecture:** Two PRs.
- **4a, API only (safe to ship alone, nothing calls it yet):** `team_members` and `wild_battles` tables; team routes
  where the client controls only *who is on the team and in what order*, never levels, XP or HP; wild battle routes
  that start a battle, take one action at a time under a row lock, write results back to the team in the same
  transaction, and reject a stale or repeated action by turn number.
- **4b, the frontend switch:** `useTeam` reads and writes the API; `BattleArena` sends actions and plays back the
  server's events; Battle, Team and "add to team" require sign-in.

**Tech Stack:** FastAPI, psycopg 3, the slice 3 engine (`app/engine/`); React + TanStack Query.

**Spec:** `docs/superpowers/specs/2026-10-26-fastapi-backend-design.md` (Data model: `team_members`, `wild_battles`;
API rows team and wild battles; Slices: 4). Decisions: "Every battle runs on the server", "Concurrent moves use row
locking", "Sign-in exists, but nothing requires it yet".

## Global Constraints

- The server is the only source of truth for levels, XP and HP. No request can set them directly.
- Every write to a `wild_battles` row reads it with `SELECT … FOR UPDATE` in a transaction, and the team write-back
  happens in the same transaction.
- Teams hold 0–6 members (`MAX_TEAM`), no creature twice, catalog creatures only (`pokemon.owner_id` doesn't exist
  until slice 6; custom Creature Lab creatures can't join a server team until then).
- Wild-battle timing from the client is clamped to 1–1.25 with `clamp_timing` before the engine sees it.
- Every route except the catalog requires `CurrentUser`; a battle or team belongs to exactly one user, found by the
  user id from the token, never from the request body.
- Errors are `{"error": ...}`: 400 bad input, 401 signed out, 404 no battle, 409 valid but not now.

## Review Focus

1. **Cheating through the team API.** `PUT /api/team` with `{"level": 100}` or `{"hp": 9999}` must have no effect;
   only `uid` and `creatureId` are read. (Task 2 test.)
2. **Huge timing bonus.** The wild engine applies `timing` unclamped (the TS trusted its own client). `timing: 100`
   must deal the same damage as `1.25`. (Task 4 test.)
3. **A double-clicked move.** Two identical action requests for the same turn must apply once: the second carries a
   turn number that's no longer current and gets 409. (Task 4 test, sent concurrently.)
4. **Another user's battle.** User B can never read or act on user A's battle or team; there is no id in the URL, the
   row is chosen by the token's user. (Task 4 test with two users.)
5. **Team changes during a battle.** Removing a team member mid-battle, then winning, must not resurrect it or crash
   the write-back. Write-back updates only members still on the team (by uid). (Task 4 test.)

---

## Phase 4a: API

### Task 1: Tables

**Files:** `api/app/db/migrations/0004_teams_and_wild_battles.sql`, `api/tests/test_teams_schema.py`

```sql
team_members (user_id uuid REFERENCES users ON DELETE CASCADE, uid text, slot int, pokemon_id int REFERENCES pokemon,
              level int, xp int, hp int NULL,          -- NULL = full HP
              PRIMARY KEY (user_id, uid), UNIQUE (user_id, slot) DEFERRABLE INITIALLY DEFERRED,
              UNIQUE (user_id, pokemon_id), CHECK (slot BETWEEN 0 AND 5), CHECK (level BETWEEN 1 AND 100))
wild_battles (user_id uuid PRIMARY KEY REFERENCES users ON DELETE CASCADE, state jsonb, turn int,
              created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())
```
The slot constraint is deferred so reordering inside one transaction can pass through duplicate slots.

- [ ] Tests: a seventh slot is rejected; the same creature twice is rejected; swapping two slots in one transaction
  works; deleting a user deletes their team and battle. RED → implement → GREEN → commit
  `"Add team and wild battle tables"`.

### Task 2: Team routes

**Files:** `api/app/teams/{__init__,store}.py`, `api/app/routes/team.py`, `api/tests/test_team_routes.py`

**Interfaces:**
- Produces: `TeamMember` (`TypedDict`, the TS shape: `creatureId`, `hp` (int | None), `level`, `uid`, `xp`);
  `async def load_team(conn, user_id) -> list[TeamMember]` (slot order); `async def save_members(conn, user_id,
  members: list[TeamMember]) -> None` (replaces the team: delete then insert, in the caller's transaction).
  Routes: `GET /api/team` → `{"members": [TeamMember…], "creatures": {id: Pokemon}}` (the creatures the members
  refer to, so the client needs no extra lookups); `PUT /api/team` body `{"members": [{"uid"?: str, "creatureId":
  int}]}` → same response; `POST /api/team/rest` → every `hp` back to NULL, same response.

PUT rules: 0–6 entries (an empty team is allowed: the picker starts there); `creatureId` must be a
catalog id, unique in the list; an entry whose `uid` matches a current member keeps that member's level, XP and HP
in its new position; any other entry is a new member: `uid` generated server-side (`secrets.token_hex(8)`), level
`START_LEVEL`, xp `xp_for_level(START_LEVEL)`, hp NULL. Unknown extra keys are ignored. Messages: `A team is 0 to 6
creatures`, `Each creature can only be on the team once`, `No creature #<id>`.

- [ ] Tests: signed out → 401; empty team at first; add two, reorder, remove one; `PUT` with `level: 100, xp: 10**9,
  hp: 9999` on an existing uid leaves them unchanged and on a new entry gives level 5; seven entries → 400; duplicate
  creature → 400; unknown id → 400; rest restores HP; two users' teams are separate. RED → GREEN → commit
  `"Add team routes; the server owns levels, XP and HP"`.

### Task 3: Starting and reading a wild battle

**Files:** `api/app/battles/{__init__,wild_store}.py`, `api/app/routes/wild.py`, `api/tests/test_wild_start.py`

**Interfaces:**
- Consumes: `create_fighter`, `create_battle`, `wild_level` (slice 3), `load_team`.
- Produces: `app.state.rng: Rng` (default `random.random`; tests replace it with `ScriptedRng`).
  `POST /api/battles/wild` → 201 `{"state": BattleState, "turn": 0}`: party = team members with HP > 0 as fighters
  (uid = member uid), enemy = a random catalog creature not on the team, chosen by `rng` over ids sorted ascending,
  at `wild_level(team levels, rng)`, uid `wild-<hex>`; replaces any existing battle (upsert). `GET /api/battles/wild`
  → the current one or 404 `{"error": "No battle in progress"}`. `DELETE /api/battles/wild` → 204 (running away).
  409 `{"error": "Your team needs a rest"}` when no member has HP; 409 `Add a creature to your team first` when empty.

- [ ] Tests: start with a scripted rng picks the expected enemy and level; the enemy is never on the team; start
  twice replaces; get after delete is 404; empty team 409; all fainted 409; user B gets 404 for user A's battle.
  RED → GREEN → commit `"Start, resume and abandon wild battles"`.

### Task 4: Taking a turn

**Files:** `api/app/routes/wild.py`, `api/app/battles/write_back.py`, `api/tests/test_wild_turns.py`

**Interfaces:**
- Produces: `POST /api/battles/wild/actions` body `{"turn": int, "action": {...}}` → `{"events", "state", "turn"}`.
  Actions: `{"type": "move", "index", "timing"?}`, `{"type": "switch", "to"}`, `{"type": "catch"}`,
  `{"type": "sendOut", "to"}`. `write_back(members, state) -> list[TeamMember]`: a port of `saveBattle` in
  `src/lib/team/team.ts` (HP, XP, level by uid; a caught enemy is added once if there's room).

In one transaction: `SELECT state, turn FROM wild_battles WHERE user_id = %s FOR UPDATE` → 404 if none; 409 `That
turn is over` if `turn` ≠ stored; 409 `The battle is over` if `state.winner`; validate the action shape (400 `Unknown
action`, `No such move`, `Can't switch to that creature`); `timing` through `clamp_timing`; run `resolve_turn` or
`send_out` with `app.state.rng`; store state and `turn + 1`; `write_back` and `save_members`; commit. Engine
`ValueError`s become 400 with their message.

- [ ] Tests: a move with a scripted rng returns the same events as calling `resolve_turn` directly; the team's HP and
  XP change after a win (and a level-up shows in `GET /api/team`); a catch adds the enemy to the team once, and not
  when the team is full; `timing: 100` deals the same as `1.25`; the same `turn` sent twice concurrently (two threads)
  → one 200, one 409; acting after the win → 409; a member removed mid-battle isn't brought back by the write-back;
  `{"type": "move", "index": -1}` → 400 (not Python's last move); user B can't act on A's battle (404).
  RED → GREEN → commit `"Play wild battle turns on the server"`.

### Task 5: Ship 4a

- [ ] Smoke tests: `GET $API_URL/api/team` and `POST $API_URL/api/battles/wild` without a token → 401.
- [ ] Decisions: the server owns stats (client sends only uid + creatureId); turn number rejects stale and repeated
  actions (rejected: idempotency keys, which friend matches get in slice 5 where two players act); write-back in the
  battle's transaction; deferred unique slot constraint; custom creatures can't join until slice 6.
- [ ] PR, review, owner merges. The live frontend is unchanged.

---

## Phase 4b: the frontend switch

### Task 6: Team from the API

**Files:** `src/hooks/useTeam.ts`, `src/lib/team/api.ts` (new), `src/hooks/useTeamCreatures.ts`, `src/test/fake-api.ts`,
and the callers listed below.

**Interfaces:**
- Produces: `useTeam(): [TeamMember[], (change: (team: TeamMember[]) => TeamMember[]) => void]`, same signature as
  today. The setter applies `change` optimistically, then `PUT`s `{members: [{uid, creatureId}]}` and replaces the
  cache with the server's answer (stats come from the server even if `change` edited them). `restTeam(): Promise<void>`
  replaces `setTeam(restAll)` in `BattleScreen` and `TeamBar`. Signed out: `[[], noop]`.
  `useTeamCreatures` reads `creatures` from the `GET /api/team` response instead of one request per member.
  `CreationCard`: "Add to team" disabled with "Custom creatures can join teams soon" (until slice 6).

- [ ] Tests (Vitest with the fake API): adding from the Explorer `PUT`s the new member; a 400 from the API rolls the
  optimistic change back and shows the message; signed out shows no team. RED → GREEN → commit.

### Task 7: Battles from the API

**Files:** `src/lib/battle/api.ts` (new), `src/components/battle/BattleArena.tsx`, `src/screens/BattleScreen.tsx`,
`src/hooks/useWildFighter.ts` (deleted), tests.

**Interfaces:**
- Produces: `startWildBattle(): Promise<{state, turn}>`, `fetchWildBattle(): Promise<{state, turn} | null>`,
  `sendWildAction(turn, action): Promise<{events, state, turn}>`, `abandonWildBattle()`. `BattleArena` takes
  `initial: {state, turn}` instead of `party`, `enemy`, `rng`, `onSave`; each menu choice calls `sendWildAction` and
  dispatches the result into the existing `flowReducer`, with the menu disabled while the request runs and an error
  line plus "Try again" on failure. `BattleScreen` resumes an in-progress battle on load (`fetchWildBattle`), else
  starts one. "Run" calls `abandonWildBattle`.

- [ ] Tests: a move sends `{turn, action}` and plays the returned events; a failed request shows the error and
  re-enables the menu; reloading mid-battle resumes it. RED → GREEN → commit.

### Task 8: Sign-in required

- [ ] `/battle` and the Team bar send signed-out users to `/login?next=<current path>`; Explorer's "Add to team"
  does too. Friend battles (`/battle/vs`) are unchanged until slice 5. Tests for each. Manual check through the dev
  proxy: sign up, build a team, battle, reload mid-battle, win, see XP on the team. Commit.

### Task 9: Ship 4b

- [ ] Docs: decisions (sign-in gating now real; `useTeam` keeps its signature over the API; the TS engine still runs
  friend battles' views until slice 5); interview questions (why the client can't set stats; turn numbers vs
  idempotency keys; how a reload resumes a battle; what happens if the network drops mid-turn).
- [ ] PR, review, owner merges; Claude watches the deploy and plays a battle on the live site.
- [ ] Walkthrough (owner): trace one move from the click in `BattleArena` to the `FOR UPDATE` and back.
