# FastAPI + Postgres backend: design

Status: draft for the owner's approval. Decisions and their reasons are in `docs/backend/decisions.md`; this document
says what gets built and in what order.

## Intent

Replace the Express API (`server/`) with a Python (FastAPI) service on Postgres, keeping the React app. The purpose is
a backend whose every decision the owner can explain without notes: the data model, the routes, the battle engine,
auth, and the concurrency and retry problems that come with real persistence. The current server keeps all state in
memory and relies on Node's single thread. The rebuild is about what changes when state moves into a database that
more than one instance shares.

## Goals

- Everything the app does today still works (Explorer, wild battles, friend battles, Creature Lab), backed by
  Postgres and the new API.
- Accounts: signup, login, and every battle and creature tied to a user.
- Every battle (wild and friend) resolved on the server by one Python port of the engine.
- Friend matches correct under concurrent moves, retried requests and abandoned players.
- Docs a reviewer can follow: design, decisions, how to run it, and "what I'd add at scale."

## Non-goals

- Password reset, email verification, social login, admin tools.
- A message broker (RabbitMQ, Redis). Named in "what I'd add at scale" instead.
- Redesigning the UI. Frontend changes are limited to talking to the new API (see Frontend).
- New game features.

## Anti-goals (a failure even if it works)

- Code the owner can't walk through line by line. Prefer plain, explicit code over clever code, and the standard
  library or one well-known package over a framework on top of a framework.
- Big-bang delivery. Each slice is merged and working before the next starts.
- A Python engine that quietly plays differently from the TypeScript one it replaces.

## Constraints

- The repo is public. `main` deploys to production on every push (`.github/workflows/deploy.yml`), so **each slice
  ships live**: the API is deployed from slice 0, and production always matches `main`. Until the last slice, the
  existing Express container keeps serving the React build and any endpoints not yet moved; the frontend calls the
  new API for the ones that have.
- Postgres runs on **Supabase** (free tier). Only its Postgres is used, not Supabase Auth or its auto-generated APIs.
- Hosting is GCP (Cloud Run, project `finny-take-home`), managed with Pulumi in `infra/`.
- The data in `src/data/pokemon.json` is the source for the catalog. Never regenerate it (see `AGENTS.md`).
- Repo conventions in `AGENTS.md` apply: decisions logged, PRs per slice, failures reported with output.

## Architecture

```
Browser ── static files (React build, own host)
   │
   └── HTTPS + Authorization: Bearer <JWT> ──► FastAPI (Cloud Run) ──► Postgres
                                                  │
                                                  └── Cloud Storage (images; browser loads them directly)
```

- **Frontend and API deploy separately.** In development the Vite dev server proxies `/api` to FastAPI on localhost,
  so dev has one origin and no CORS. In prod the API allows the frontend's origin explicitly.
- **Supabase specifics.** Supabase auto-exposes tables in the `public` schema through its Data API to anyone with the
  project's public key. We don't use that API, so every table gets row-level security enabled with no policies (or the
  Data API is switched off), which closes that door; a migration test checks it. Normal queries go through Supabase's
  connection pooler, but `LISTEN/NOTIFY` needs a long-lived session, so the API connects through the session-mode
  pooler (IPv4, one connection per client), not the transaction pooler or the IPv6-only direct host. `SELECT … FOR UPDATE` works through the pooler because it lives inside one transaction.
- **PR previews have no API.** They would share the prod database; only `prod` deploys the API.
- **One API service, stateless instances.** Anything that must survive a restart or be seen by another instance lives
  in Postgres. Live match updates reach players connected to any instance through Postgres `LISTEN/NOTIFY`.

### Repo layout

| Path | What |
| --- | --- |
| `api/` | The FastAPI project: its own `pyproject.toml`, tests, Dockerfile |
| `api/app/main.py` | App setup: routers, CORS, health route |
| `api/app/routes/` | One module per area: `pokemon`, `auth`, `teams`, `battles`, `matches`, `creatures` |
| `api/app/engine/` | The Python port of `src/lib/battle/` (pure functions, no database or HTTP) |
| `api/app/db/` | Connection handling and SQL migrations |
| `api/tests/` | pytest, against a real Postgres |
| `docker-compose.yml` | Local Postgres for dev and tests |
| `src/` | The React app, unchanged except where noted below |
| `server/` | Express, deleted in the cutover slice |

### Stack

- Python 3.12+, FastAPI, Pydantic for request and response models, uvicorn.
- `uv` for dependencies and running commands. *(Builder's call; recorded as such.)*
- Postgres 16 via `psycopg` 3 with hand-written SQL. No ORM: the locking and the queries are things to explain, and
  SQL shows them directly. Migrations are numbered `.sql` files applied in order by a small script that records which
  have run. *(Builder's call.)*
- Password hashing: argon2 (`argon2-cffi`). Tokens: PyJWT, HS256, secret from the environment.
- Tests: pytest with FastAPI's test client, against a real Postgres (row locking can't be tested against a fake).

## Data model

Draft; the builder may adjust columns but not the shape of the decisions.

```
users           id uuid PK · username text UNIQUE · password_hash · created_at
pokemon         id int PK · owner_id → users NULL · name · types text[] · hp · attack · defense · special_attack
                · special_defense · speed · height · weight · description · generation · image_url · is_legendary
                · created_at
team_members    user_id → users · slot int · uid text · pokemon_id → pokemon · level · xp · hp NULL
                PK (user_id, uid), UNIQUE (user_id, slot)
wild_battles    user_id → users PK (one at a time) · state jsonb · events jsonb · turn · created_at · updated_at
matches         id text PK (8-char share code) · host_id → users · guest_id → users NULL · host_team int[] NULL
                · guest_team int[] NULL · host_pending jsonb NULL · guest_pending jsonb NULL · state jsonb NULL
                · events jsonb · turn · outcome jsonb NULL · host_seen_at · guest_seen_at · created_at · started_at
                · finished_at
match_actions   match_id · user_id · idempotency_key · response jsonb · created_at
                PK (match_id, user_id, idempotency_key)
```

- **Catalog and custom creatures share `pokemon`.** `owner_id IS NULL` marks the 1,000 catalog records (ids 1–1000,
  loaded from `pokemon.json`); custom creatures get `owner_id` and ids from 1001 up, as they do today
  (`src/lib/creature.ts`). Names are not unique (835 of 1,000).
- **Search indexes:** `pg_trgm` GIN on `name` and `description` (for `ILIKE '%x%'`), GIN on `types`.
- **Battle state is one JSONB column**, exactly what the engine returns. Nothing queries inside it.
- **Row locking:** any write to a `matches` or `wild_battles` row happens in a transaction that first reads it with
  `SELECT … FOR UPDATE`.

## API

Same paths and response shapes as today where an endpoint already exists, so the frontend change is small. Errors are
`{ "error": "<message for people>" }` with 400 (malformed), 401 (no or bad token), 404 (not found, or not yours), 409
(valid but not now) or 429/503 (limits).

| Method and path | Auth | What |
| --- | --- | --- |
| `GET /api/health` | no | Liveness, used by Cloud Run and the deploy smoke test |
| `GET /api/pokemon?page&limit&search&sort&type` | optional | Catalog, plus the caller's own creatures when signed in. Same params, limits and `{data, pagination}` shape as `server/query.ts` |
| `GET /api/pokemon/{id}` | optional | One creature (replaces the client's page-N lookup in `src/lib/api.ts`) |
| `POST /api/auth/signup`, `POST /api/auth/login` | no | Return an access token |
| `GET /api/me` | yes | The signed-in user |
| `GET /api/team`, `PUT /api/team` | yes | The user's saved team (replaces `localStorage`) |
| `POST /api/battles/wild` | yes | Start a wild battle from the saved team; returns state |
| `GET /api/battles/wild` | yes | The current wild battle, for resuming after a refresh |
| `POST /api/battles/wild/actions` | yes | `{action}` → `{state, events}`; results (XP, levels, catches, HP) are written back to the team |
| `POST /api/matches`, `POST /api/matches/{id}/join` | yes | As today, but seats are users, not tokens |
| `POST /api/matches/{id}/actions` | yes | As today; `Idempotency-Key` header required for moves |
| `GET /api/matches/{id}/events` | yes (query param) | SSE stream of the caller's view, as today |
| `POST /api/creatures` | yes | Generate a creature and image, store both |
| `DELETE /api/creatures/{id}` | yes | Delete one of your own creatures |

- **Participant check:** a match or creature the caller doesn't own or play in returns 404, not 403, so existence
  isn't confirmed to outsiders.
- **SSE and auth:** `EventSource` can't send headers, so the events route takes the access token as `?token=`. Trade-off:
  tokens can end up in access logs; they expire in an hour. The token is checked when the stream opens. A one-time stream ticket is the alternative if that
  matters.
- **The wild-battle enemy, randomness and the timing bonus** are all server-side. The client sends the timing-bar
  value as today, clamped to 1–1.25 (`clampTiming`).

## Auth

Kept deliberately small (about 100 lines): one token, no refresh.

- Passwords are hashed with argon2; only the hash is stored. Login compares with the library's verify function and
  gives the same error for an unknown username and a wrong password.
- Access token: JWT, HS256, **1-hour expiry**, claims `sub` (user id), `exp`, `iat`, signed with a secret from the
  environment. One FastAPI dependency (`current_user`) reads the `Authorization: Bearer` header, verifies the
  signature and expiry, and loads the user; every protected route depends on it.
- No refresh tokens. When the token expires, the next request gets a 401 and the user logs in again. Logout is
  client-side: the token is forgotten. Refresh tokens with rotation, and server-side revocation, are named in "what I'd
  add at scale."
- The frontend keeps the token in `localStorage`; on a 401 it clears it and sends the user to log in. Trade-off
  (documented): any script running on the page can read `localStorage` (XSS risk); httpOnly cookies avoid that but
  need CSRF protection and cross-site cookie settings, since the frontend and API are on different origins.
- Explorer browsing needs no account. Battles, teams and Creature Lab do; the UI sends signed-out users to a login
  screen.

## Battle engine port

- Port `engine.ts`, `versus.ts`, `stats.ts`, `moves.ts`, `type-chart.ts`, `catch.ts` and the clamp from `timing.ts`
  to `api/app/engine/`. `flow.ts` and `script.ts` are UI pacing and stay in the client.
- Same rules and the same order of random draws (per attack: hit, then crit, then roll). Tests are ported from the
  TypeScript tests with the same scripted random numbers and must produce the same results. That's the proof the
  port is faithful.
- Pure functions over plain data, an injected `rng`, input state never mutated, events as output: same design as
  today.
- Once wild battles run on the server, the client stops importing the engine's rules. It keeps only what's needed to
  display the state and replay events.

## Friend matches

Same lifecycle and rules as `server/matches.ts` (`waiting → picking → battle → over`, simultaneous turns, hidden
opponent team, outcome `knockout | forfeit | left`), with these changes:

- **Seats are users.** Join records `guest_id`; the host can't join their own match.
- **Turns:** in one transaction, `SELECT … FOR UPDATE` the match, store the caller's pending action, and if both
  are in, resolve the turn and clear both pending actions.
- **Retries:** a move carries an `Idempotency-Key`. In the same transaction, the key is inserted into
  `match_actions`; if it already exists, the stored response is returned and nothing is applied.
- **Live updates:** after a commit, the API runs `NOTIFY match_<id>`. Each instance listens on one connection and
  pushes the new per-seat view to the SSE streams it holds. Views are built from the database row, never cached.
- **Presence and timeouts:** an open stream updates the seat's `*_seen_at` every few seconds. A sweep applies today's
  rules: away after 5 s, forfeit (`left`) after 60 s, unstarted matches deleted after 30 min, finished ones after 10
  min. Cloud Run can scale to zero, so the sweep can't rely only on a background loop: it runs inside the API process
  while instances are up and on match reads, and its updates are idempotent SQL so two instances sweeping at once is
  harmless.
- **Limits** carry over: 20 new matches per IP per hour, 500 open matches, 2 KB request bodies. Per-IP limits may stay
  in memory per instance (documented as approximate) or move to Postgres; builder's call.

## Creature Lab

- `POST /api/creatures` ports `server/create.ts` (request parsing, stat roll, prompt) and `image-generator.ts`
  (Vertex AI image call) to Python. The image goes to a Cloud Storage bucket; the row stores its public URL.
- Rate limits as today (5 per user per hour, 100 per day overall), since each image costs money.
- The client's IndexedDB store goes away. Creations a user made before the rebuild aren't migrated: they were never
  tied to an account.

## Images (later slice)

A one-off script downloads the 1,000 catalog images, resizes them to one small size, uploads them to the bucket and
updates `image_url`. The browser loads images from the bucket directly, never through the API. Loremflickr images
carry mixed Flickr licenses; the README notes it.

## Frontend changes

- `src/lib/api.ts` and `versus-api.ts` call the new endpoints, attach the access token, send the user to log in on a 401, and
  surface errors as they do today. Loading and error states for each new call.
- Login and signup screen; signed-out users who open Battle, Team or Create land there.
- The team store and creation store read and write the API instead of `localStorage` and IndexedDB.
- The wild-battle screen sends each action to the API and replays the returned events, as friend battles already do.
- The API base URL comes from a build-time variable (`VITE_API_URL`), empty in dev (proxy).

## Slices

Each slice is one PR (or a few), merged and working before the next starts, and the owner walks through it before
moving on. The API is live from slice 0; Express is retired in slice 8.

0. **Skeleton, deployed:** `api/` project, docker-compose Postgres, migration runner, `GET /api/health`, pytest in CI,
   Vite proxy. The Supabase project, and Pulumi plus CI for the API's own Cloud Run service with the database URL and
   JWT secret as secrets; the deploy smoke test checks the new health route too. Nothing user-visible.
1. **Pokémon:** `pokemon` table, seed from `pokemon.json`, `GET /api/pokemon` and `/api/pokemon/{id}` with today's
   behavior (ported `server/query.test.ts` cases pass). The frontend calls the new API (`VITE_API_URL`), so CORS for
   the prod frontend origin lands here.
2. **Auth:** users, signup/login/me, `current_user` dependency. Frontend login screen
   and token handling.
3. **Engine port:** `api/app/engine/` with ported tests. No routes.
4. **Teams and wild battles:** team endpoints, wild-battle endpoints, frontend team store and battle screen switched.
5. **Friend matches:** tables, locking, idempotency, SSE with `LISTEN/NOTIFY`, sweep. Includes a test that fires both
   players' moves at once and asserts the turn resolves exactly once, and cross-user access tests.
6. **Creature Lab:** creatures in Postgres, image generation, bucket.
7. **Catalog images:** copy and resize into the bucket.
8. **Cutover:** the React build moves to static hosting, CORS points at its origin, the Express container and
   `server/` are deleted, README and docs final.

## Docs to deliver

- `README.md`: what it is, how to run it, architecture diagram, a "decisions and trade-offs" summary linking
  `docs/backend/decisions.md`, and "what I'd add at scale" (message broker for durable events, distributed rate
  limits, read replicas, a job queue for image generation, refresh tokens with rotation and revocation, httpOnly cookie
  auth).
- `docs/backend/decisions.md` kept current, one entry per decision.

## Left to the builder

- Exact column types, index names and migration file names.
- Module layout inside `api/app/` beyond what's listed.
- Test fixtures and how the test database is reset between tests.
- Whether per-IP limits live in memory or Postgres (document whichever).

## Calls made without the owner (check these)

- Friend battles need both players signed in; an invite link sends a signed-out friend to sign up, then back to the
  match.
- The token is kept in `localStorage` (XSS trade-off documented).
- `?token=` on the SSE route.
- No ORM: `psycopg` with hand-written SQL and numbered `.sql` migrations; `uv` for dependencies.
- Old browser-only creations aren't migrated.

## Open, decided in slice 8

- Where the static frontend is hosted (Firebase Hosting or a Cloud Storage bucket behind a CDN).
