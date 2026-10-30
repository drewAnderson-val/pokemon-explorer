# Backend decisions

The Express API was rebuilt in Python (FastAPI) on Postgres; the cutover (slice 8) retired Express. Each entry records one decision: what was chosen,
why, what was rejected, and the cost accepted. Append new entries at the bottom; if a decision is reversed, add a new
entry that says so rather than editing the old one.

Template:

```
## YYYY-MM-DD: <decision in a few words>

- **What:**
- **Why:**
- **Rejected:** <alternative>, because …
- **Trade-off:** what this costs, and when it would stop being the right call.
```

## 2026-10-26: Python (FastAPI) instead of Node (Express)

- **What:** replace `server/` with a FastAPI service. The React app stays and changes only where it calls the API.
- **Why:** the owner reads and writes Python more fluently than Node, and FastAPI's request validation (Pydantic) and
  dependency injection keep parsing and auth out of the route bodies.
- **Rejected:** keeping Express and adding a database. It keeps one language and lets client and server share code,
  but the point of the rebuild is a backend the owner can explain line by line.
- **Trade-off:** the battle engine (`src/lib/battle/`) is TypeScript and shared with the client today. Moving to Python
  means porting it; whether wild battles also move to the server is still open.

## 2026-10-26: Postgres instead of Mongo

- **What:** Pokémon, users and matches live in Postgres.
- **Why:** resolving a turn is "both moves are in, update the match atomically": one transaction on one row. Users,
  matches and their players are relational. Pokémon search becomes an indexed SQL query instead of filtering an array
  on every request.
- **Rejected:** Mongo, with one document per match and `findOneAndUpdate`. It would work, but nothing here needs a
  flexible schema, and the battle state is stored as a single JSONB column anyway.
- **Trade-off:** schema changes need migrations.

## 2026-10-26: Auth built in-house, tokens signed with PyJWT

- **What:** a `users` table, password hashing, signup and login routes, and short-lived access tokens (JWT) signed with
  PyJWT. The token's `sub` claim is the user id.
- **Why:** hashing, token claims, signing and expiry are the parts worth understanding, and a hosted service hides them.
- **Rejected:** Supabase Auth and Auth0 (they hide those parts); hand-writing the JWT signing (a well-tested library is
  safer, and it's still clear what it does).
- **Trade-off:** password resets, email verification and rate-limiting logins are ours to build, or to leave out.

## 2026-10-26: Concurrent moves use row locking

- **What:** taking a turn reads the match with `SELECT … FOR UPDATE` inside a transaction.
- **Why:** both players can move at the same instant. Without a lock, each request can read "the other hasn't moved,"
  save only its own move, and nobody resolves the turn, so the match is stuck. With the lock, the second request waits
  until the first commits, then sees both moves and resolves the turn.
- **Rejected:** a `version` column (optimistic locking: update only if the version is unchanged, otherwise re-read
  and retry). It avoids waiting but needs a retry loop, and it pays off only when collisions are rare and contention is
  high.
- **Trade-off:** requests on the same match wait in line. With two players per match that's milliseconds; a row shared
  by many writers would need a different approach.

## 2026-10-26: No message broker yet

- **What:** no RabbitMQ or Redis at the start.
- **Why:** nothing yet needs one. The one real need is live match events reaching a player connected to a different
  server instance, and Postgres `LISTEN/NOTIFY` covers that without another service.
- **Rejected:** RabbitMQ for turn resolution or the timeout sweeper. A turn takes milliseconds, so there's nothing to
  queue.
- **Trade-off:** `LISTEN/NOTIFY` doesn't keep messages for a listener that's offline. A broker would be the next step if
  that ever mattered.

## 2026-10-26: Every battle runs on the server, wild battles included

- **What:** the battle engine is ported to Python and runs only on the server. The wild-battle screen sends each
  action to the API and plays back the events it returns, the way friend battles already do. Teams and progress move
  from `localStorage` to the user's account.
- **Why:** one engine, one set of rules. Keeping the TypeScript engine for wild battles alongside a Python one for
  friend battles would mean two copies of the same rules that drift apart. The server is the only source of truth for
  every battle, which is what makes saved progress, resuming after a refresh and cross-device play possible.
- **Rejected:** wild battles staying in the browser. Each turn would skip a network round trip, but the game is
  turn-based, and the attack animation already takes longer than the request.
- **Trade-off:** one request per turn, and the wild-battle screen has to be rewired from running the engine itself to
  calling the API. That's the largest frontend change in the rebuild.

## 2026-10-26: Frontend and API deploy separately

- **What:** the React app is built to static files and hosted on its own; the FastAPI service deploys on its own
  (Cloud Run). In development, the Vite dev server proxies `/api` to FastAPI on localhost.
- **Why:** Python can't host Vite the way Express does today (`server/app.ts`), so dev splits regardless. In prod the
  frontend needs no server at all, each side deploys without restarting the other, and each image only has one
  language in it. The browser calling the API on another origin means CORS is configured on purpose.
- **Rejected:** one container where FastAPI also serves the React build. Same origin and no CORS, but a mixed
  Node-and-Python build, and every frontend change redeploys the API.
- **Trade-off:** two deploys to run, and CORS to get right. Where the static files are hosted is still open.

## 2026-10-26: Creature Lab moves to the server, images go to a bucket

- **What:** custom creatures are stored in Postgres with an owner, their generated images go to a Cloud Storage
  bucket, and the image-generation call is ported to Python. A later slice copies the 1,000 catalog images into the
  same bucket, resized to one small size.
- **Why:** battles run on the server, so the server has to know every creature on a team, including custom ones. Today
  those live only in the browser's IndexedDB. The catalog's `imageUrl`s point at full-size stock photos (up to
  3266×1298) on third-party hosts, which are slow and sometimes fail; serving small copies from our own bucket fixes
  that at the source.
- **Rejected:** dropping Creature Lab (smallest scope, but it loses a feature the app already has); keeping it
  browser-only and out of battles (the server would treat some team members differently).
- **Trade-off:** image storage and a paid AI call to run and rate-limit. Images are served from the bucket, never
  through the API. Loremflickr images carry mixed Flickr licenses, so copying them for a public demo needs a note.

## 2026-10-26: Ship each slice live; Postgres on Supabase

- **What:** the new API deploys to its own Cloud Run service from the first slice, and each slice goes live as it
  merges. Postgres runs on Supabase's free tier; only the database is used, not Supabase Auth or its Data API.
- **Why:** `main` deploys on every push, so a frontend that expects the new API must have it live. Shipping per slice
  keeps production matching `main` and always leaves a working URL. Supabase is chosen for one reason: its free tier.
  This is a demo, and Cloud SQL bills for an always-on instance even when nobody is using it.
- **Rejected:** a long-lived `rebuild` branch merged at the end (one big-bang merge); Cloud SQL (the right choice if
  this were a real product on GCP: private networking to Cloud Run, same region, IAM database auth, one bill; rejected
  on cost alone); Neon (also free; no strong reason either way).
- **Trade-off:** the database is outside GCP, so every query crosses the internet (a few ms). Supabase's Data API
  exposes `public` tables unless RLS is on, so every table enables RLS. `LISTEN/NOTIFY` needs a direct connection
  rather than the transaction pooler.

## 2026-10-26: Auth stays small: one access token, no refresh tokens

- **What:** signup and login return one JWT that expires after an hour; after that the user logs in again. Logout
  just forgets the token on the client.
- **Why:** the hard problem this project is meant to show is battles under concurrency, not auth. The small version
  still covers what's worth knowing (password hashing, what's in a token, how it's signed and checked, why it
  expires) in about 100 lines.
- **Rejected:** Supabase Auth (less code, and it brings password resets for free, but hashing and issuing tokens
  become "Supabase does it," and the frontend needs Supabase's client library); refresh tokens with rotation and
  revocation (more realistic, but another table and flow for little gain in a demo).
- **Trade-off:** a stolen token works until it expires, and logout can't revoke it. Users log in again every hour.
  Refresh tokens are listed under "what I'd add at scale."

## 2026-10-26: Async database access (psycopg 3, async pool)

- **What:** routes use `psycopg`'s async connection pool.
- **Why:** later slices hold live connections open (SSE streams for friend matches, a `LISTEN` connection). With
  async, a waiting stream costs almost nothing; with sync routes each one would hold a worker thread.
- **Rejected:** sync `psycopg` (a little simpler to read; FastAPI runs sync routes in a thread pool, which caps how
  many streams can wait at once).
- **Trade-off:** `async`/`await` everywhere, and a blocking call by mistake stalls every request on that instance.

## 2026-10-26: Migrations run on startup, under an advisory lock

- **What:** numbered `.sql` files in `api/app/db/migrations/` are applied when the API starts, each in its own
  transaction together with its row in `schema_migrations`. The whole run holds `pg_advisory_lock`.
- **Why:** two instances can start at once (a deploy, a scale-up). Without the lock both try to apply the same file;
  the test for it fails with a duplicate-key error when the lock is removed. A failed migration rolls back, the
  instance fails its startup probe, and Cloud Run keeps serving the previous revision.
- **Rejected:** a CI step that runs migrations before deploy (GitHub would need the database password); Alembic (a
  framework for something a 50-line runner does visibly).
- **Trade-off:** a slow migration delays startup and can exceed the probe budget (about 20 s); a big one would need to
  run separately.

## 2026-10-26: Health checks the database

- **What:** `/api/health` runs `SELECT 1` with a 2-second limit and answers 503 `database unavailable` on failure.
- **Why:** a health route that always says ok would let a deploy with a broken connection string go live.
- **Rejected:** a static 200.
- **Trade-off:** a database outage makes new revisions fail their startup probe (old ones keep serving).

## 2026-10-26: The API is deployed from prod only; Supabase via its session pooler

- **What:** only the `prod` Pulumi stack creates the API service. Its runtime account and two secrets
  (`api-database-url`, `api-jwt-secret`) live in the owner-run bootstrap stack; secret values are added with `gcloud`
  and never touch the repo or Pulumi state. The database URL is Supabase's session pooler.
- **Why:** PR previews would share the prod database, so a PR's migration would change prod. The runtime account must
  exist before secrets can be granted to it, and only the owner can grant IAM roles. Supabase's direct host is
  IPv6-only, which Cloud Run can't reach without extra networking; the session pooler is IPv4 and, unlike the
  transaction pooler, keeps one connection per client, so `LISTEN/NOTIFY` works.
- **Rejected:** per-PR databases (Supabase branching is paid); the transaction pooler (breaks `LISTEN/NOTIFY`).
- **Trade-off:** API changes can't be tried on a preview URL before merge; the session pooler limits connections per
  client to the pool size.

## 2026-10-26: Postgres moves from Supabase to Cloud SQL (reverses two entries above)

- **What:** prod Postgres is a Cloud SQL instance (`pokemon-db`, Postgres 17, `db-f1-micro`) in the owner-run bootstrap
  stack, `protect`ed with its database, the API's runtime account and the two secrets. Cloud Run reaches it through
  its built-in connector (a Unix socket under `/cloudsql/`). This replaces "Ship each slice live; Postgres on Supabase"
  (the Supabase half) and the session-pooler part of "The API is deployed from prod only".
- **Why:** Supabase was chosen only because it was free. The project has GCP credits, which removes that reason, and
  keeping everything in GCP removes a list of things to explain and get right: Supabase's Data API exposing `public`
  tables (and the RLS workaround), pooler modes and which one breaks `LISTEN/NOTIFY`, the IPv6-only direct host, and
  queries crossing the internet to another provider. Nothing had been deployed yet, so the switch cost one PR's
  rework. The RLS migration and its test were dropped: nothing auto-exposes tables on Cloud SQL.
- **Rejected:** staying on Supabase (free, but more moving parts to defend); Cloud SQL with private IP and a VPC
  connector (no public IP at all, but adds networking resources the demo doesn't need; the public IP has no authorized
  networks, so only IAM-checked connector traffic gets in).
- **Trade-off:** about $10/month, paid by credits; when they run out, stop the instance or move. The database user's
  password is a secret (in the URL) rather than IAM database auth, which would avoid passwords but needs the Cloud SQL
  Python connector or the Auth Proxy; noted under "what I'd add".

## 2026-10-26: An API failure fails the deploy job, but never hides the Express checks

- **What:** both services deploy in one `pulumi up`, so an API problem (a missing secret version, a failing migration)
  turns the deploy job red. The API's smoke check runs last, after the Express checks.
- **Why:** a red deploy is the signal that something in prod needs attention, whichever service it is. Running the API
  check last means a broken API never prevents the Express app's own checks from reporting.
- **Rejected:** a separate Pulumi stack or job for the API (isolates failures, but adds a second state and pipeline for
  a temporary arrangement: Express is retired in slice 8).
- **Trade-off:** until slice 8, an API failure can make an Express-only change look like a failed deploy.

## 2026-10-27: The catalog is seeded by a generated migration

- **What:** `api/scripts/generate_seed.py` turns `src/data/pokemon.json` into `0002_seed_pokemon.sql`, one `INSERT` of
  1,000 rows, committed. A test fails if the file no longer matches the JSON, and another checks every record reads
  back unchanged (floats, type order, which records have `isLegendary`).
- **Why:** the seed then runs exactly once, under the same lock and transaction as every other migration, and the API
  image needs neither the JSON nor a seed step.
- **Rejected:** a seed step on startup (runs on every start, needs its own "already seeded?" check); copying the JSON
  into the API image and loading it in Python (a second copy of the data to keep in sync).
- **Trade-off:** a 230 KB generated file in the repo. Changing the data means regenerating it in a new migration, not
  editing this one.

## 2026-10-27: Parity with Express is proven by a shared golden file

- **What:** `server/golden.test.ts` runs 21 requests through the Express query code and writes the answers to
  `api/tests/golden/pokemon_queries.json`. The TypeScript suite checks Express still matches it; the Python suite
  checks FastAPI returns the same status and body for each.
- **Why:** "ported the tests" only proves the cases someone thought of. Running both implementations on the same
  inputs and comparing whole responses catches differences nobody wrote a test for (sort ties, escaping, page math).
- **Rejected:** porting `server/query.test.ts` alone (kept for the parser, but weaker for responses).
- **Trade-off:** the golden file is only as good as its 21 cases. When Express is deleted, the file stays as the
  record of the expected behavior.

## 2026-10-27: Search uses LIKE with escaping, backed by trigram indexes

- **What:** search lowercases the term, escapes `\`, `%` and `_`, and matches `lower(name)`, `lower(description)` and
  each type with `LIKE '%term%'`. GIN trigram indexes exist on `lower(name)` and `lower(description)`.
- **Why:** Express matched a literal substring. In SQL, `%` and `_` are wildcards, so an unescaped `search=%` would
  return all 1,000 records (the golden tests fail when the escaping is removed). A leading `%` can't use a B-tree
  index; a trigram index can.
- **Rejected:** `ILIKE` without escaping (wrong results); full-text search (matches whole words, not substrings, so
  `fir` wouldn't find `fire`).
- **Trade-off:** at 1,000 rows Postgres still chooses a sequential scan (cheaper at this size); the indexes pay off as
  the table grows, and cost a little on every insert.

## 2026-10-27: Dev and test databases are separate

- **What:** docker compose creates `pokemon` for dev (`pnpm dev:api`); tests use `postgres` and drop its schema.
- **Why:** running the tests would otherwise wipe the database the dev server is using.
- **Trade-off:** none worth noting.

## 2026-10-27: Two /api/pokemon implementations until the cutover

- **What:** the frontend calls FastAPI's `/api/pokemon`; Express keeps its own until slice 8.
- **Why:** the deploy smoke test and existing Express tests still use it, and removing it now would mean changing the
  Express image twice.
- **Trade-off:** two copies of the same behavior for a few slices; the golden file keeps them equal.

## 2026-10-27: Passwords are hashed with argon2id at 19 MiB, 2 passes, 1 lane

- **What:** `argon2-cffi` with `time_cost=2, memory_cost=19 MiB, parallelism=1`, OWASP's recommended minimum. The
  parameters are stored in each hash, so they can be raised later without breaking existing passwords. Hashing and
  verifying run in the thread pool.
- **Why:** argon2id is slow and memory-hard on purpose, so a stolen hash is expensive to guess against. The library's
  default (64 MiB) would let a burst of logins exhaust a 512 MiB Cloud Run instance. In an `async` route the ~25 ms of
  CPU would stall every other request on the instance; a test fails when verify runs on the event loop.
- **Rejected:** bcrypt (older, and silently truncates passwords at 72 bytes); the 64 MiB default.
- **Trade-off:** each login costs ~25 ms of CPU and 19 MiB briefly. Passwords are capped at 128 characters so a huge
  one can't cost more.

## 2026-10-27: Tokens are HS256 with the algorithm pinned, and a 32-byte minimum secret

- **What:** PyJWT signs `{sub, iat, exp}` with HMAC-SHA256. Verification only accepts HS256 and requires all three
  claims. The API refuses to start with a `JWT_SECRET` under 32 bytes (prod uses 64 hex characters).
- **Why:** one service signs and verifies, so a shared secret is enough. Pinning the algorithm stops a forged token
  from naming `none` (no signature) in its own header; a test sends one. A short secret can be brute-forced offline
  from any single token.
- **Rejected:** RS256 (a key pair, worth it only when other services verify tokens they can't sign).
- **Trade-off:** rotating the secret signs everyone out.

## 2026-10-27: Unknown usernames get the same answer and the same work

- **What:** login returns `401 Wrong username or password` for both an unknown username and a wrong password, and
  for an unknown username still runs one argon2 verify (against a dummy hash).
- **Why:** a different message, or a faster answer because hashing was skipped, would tell anyone which usernames
  exist. A test fails if the dummy verify is removed.
- **Trade-off:** signup still says "That username is taken", which reveals the same thing; that's the usual
  compromise, since people need to know why signup failed. A rate limit would close it; see below.

## 2026-10-27: Usernames are unique ignoring case; the index decides

- **What:** a unique index on `lower(username)`; signup inserts and turns the unique violation into 409, with no
  "does it exist?" query first.
- **Why:** `Drew` and `drew` as two accounts would confuse people and enable impersonation. Checking first and then
  inserting has a race: two signups can both pass the check. The index can't be raced.

## 2026-10-27: Sign-in exists, but nothing requires it yet

- **What:** accounts, the token and `current_user` ship now; no screen or route is gated.
- **Why:** teams and battles still run in the browser until slice 4. Requiring sign-in before anything is stored per
  user would block features without protecting anything. Slice 4 adds the gating together with the routes that need it.
- **Rejected (for now):** login rate limiting and lockout. Named in "what I'd add at scale": per-IP and per-username
  limits in Postgres or Redis.

## 2026-10-27: The battle engine is ported to Python as plain camelCase dicts

- **What:** `api/app/engine/` ports `src/lib/battle/` rule for rule (wild and friend battles, stats, moves, type
  chart, catching). State and events are plain dicts typed with `TypedDict`, using the **same camelCase keys** as the
  TypeScript types. The TypeScript engine stays until slice 4 moves wild battles to the server.
- **Why:** what the engine returns is exactly what Postgres stores (JSONB) and what the frontend already renders: one
  shape, no conversion layer to keep in sync. Pure functions with an injected `rng` and no mutation of the input keep
  the port testable and make a failed turn harmless.
- **Rejected:** snake_case dataclasses with a to/from JSON layer (two shapes of every object, and a place for them to
  drift); keeping the engine in TypeScript only (two languages on the server, or battles staying in the browser).
- **Trade-off:** camelCase keys in Python code look foreign; `TypedDict` still gives the type checker every key.

## 2026-10-27: The port is proven by recorded battles, not just ported tests

- **What:** `src/lib/battle/golden.test.ts` plays 16 scripted battles with real creatures and exact random numbers
  and records every event, state and how many random numbers each step used to `api/tests/golden/battles.json`. The
  Python tests replay all of them and compare with number types included (24 is not 24.0).
- **Why:** an extra or missing random draw shifts every later number and silently changes a battle; a rounding
  difference changes damage by one. Comparing whole outputs catches what hand-written assertions miss. Mutation checks
  confirmed it: drawing crit before hit, or not flipping the guest's events, fails the replay.
- **Two traps the port hit:** JavaScript's `Math.round` rounds halves up, Python's `round` rounds them to even
  (`round(4.5) == 4`), so the engine uses its own `js_round`; and JSON prints `0.5 × 2` as `1`, so whole-number
  multipliers are returned as `int`.
- **Trade-off:** the replay is as good as its 16 scenarios; unit tests ported from the TypeScript cover the rest.

## 2026-10-28: The engine treats actions as untrusted, and wild timing is clamped

- **What:** both engines clamp the timing-bar bonus to 1–1.25 in wild battles too (before, only friend battles did),
  and the Python engine rejects anything that isn't a well-formed move, switch or catch with a `ValueError`: a missing
  or unknown `type`, a missing index, a bool/float/string index, a missing seat in a friend turn.
- **Why:** the TypeScript engine trusted its own client. Once the server plays wild battles, the action comes from any
  browser: unclamped, `timing: 1000` dealt 75,352 damage; `{"type": "run"}` silently threw a ball; `to: true` stored
  `"active": true` in the state. A review found these by fuzzing both engines with 3,000 random battles (byte-identical
  output for valid play) and then probing bad input.
- **Rejected:** validating only in the route's request model. The engine is the last line before the state is
  stored, and slice 5 reuses it from another route.
- **Trade-off:** the TS engine now clamps wild timing too, so the two stay identical; its own timing bar never produced
  values outside 1–1.25, so nothing changes for players.

## 2026-10-28: The server owns a team's levels, XP and HP

- **What:** `PUT /api/team` reads only `uid` and `creatureId` per member. An existing member (same uid *and* same
  creature) keeps its stats in its new position; anything else joins fresh at level 5. Only battle results change
  stats. Extra fields like `level: 100` are ignored.
- **Why:** once the server is the source of truth, any field the client can set is a field anyone can set with curl.
  The uid has to match the creature too, or a strong member's stats could be moved onto another creature.
- **Rejected:** accepting the whole member and validating ranges (a valid level-100 is still a cheat).
- **Trade-off:** local progress from before accounts doesn't carry over: a new account starts at level 5.

## 2026-10-28: Wild turns: a turn number, under row locks, with the team saved in the same transaction

- **What:** each action names the turn it's for. The route locks the user's row, then the battle row
  (`SELECT … FOR UPDATE`), rejects a turn that isn't current with 409, runs the engine, stores the new state and
  `turn + 1`, and writes HP/XP/levels/catches back to the team, all in one transaction. Team edits and battle starts
  take the same user lock first, so one user's team changes happen one at a time.
- **Why:** a double click or a retried request must not play a move twice. A test sends the same turn twice at once:
  one 200, one 409. With the locks removed (turn check kept) that test failed 5 out of 5 runs: both requests read
  turn 0 before either saved. The turn check needs the lock to be safe. Saving the team in the same transaction means
  the battle and the team can never disagree.
- **Rejected:** idempotency keys (they replay the stored answer to a retry; worth it for friend matches in slice 5,
  where two players' requests interleave, but a turn number says the same thing here with no extra table).
- **Trade-off:** a client that lost a response must re-read the battle (`GET`) to learn the current turn.

## 2026-10-28: Custom creatures can't join a server team until Creature Lab moves (slice 6)

- **What:** teams reference `pokemon` rows, and custom creatures still live only in the browser.
- **Trade-off:** a temporary step back in slice 4b ("Add to team" disabled for custom creatures), accepted by the
  owner to keep battles first.

## 2026-10-28: The browser plays wild battles through the API; sign-in now required

- **What:** `BattleArena` sends each action with its turn number to `/api/battles/wild/actions` and plays back the
  events the server returns; the browser no longer rolls any dice for wild battles. The battle screen resumes a battle
  in progress after a reload. Battles, the team bar and "Add to team" need an account (friend battles wait for slice
  5).
- **Why:** the server is the only source of truth for a battle, so progress survives a reload or another device, and
  nobody can edit their way to a win in the browser.
- **Trade-off:** one request per turn; the menus wait for it (the attack animation hides most of it).

## 2026-10-28: `useTeam` keeps its shape, backed by the API

- **What:** `useTeam()` still returns `[team, setTeam(change)]`, so the seven screens using it barely changed. Behind
  it, a small store applies each change at once (optimistic), queues the requests so they arrive in order, and replaces
  the local copy with the server's answer; a refused change rolls back to the last confirmed team and `TeamBar` shows
  why.
- **Why:** the server's answer is authoritative (it assigns uids and owns stats), but waiting for it on every click
  would make the team feel slow.
- **Rejected:** TanStack Query mutations (the rest of the team code is a plain external store; one pattern is easier to
  explain); no optimism (a visible delay on every add/remove).
- **Trade-off:** a change can appear and then roll back if the server refuses it.

## 2026-10-28: UI tests run against a fake server built on the TypeScript engine

- **What:** `src/test/fake-server.ts` implements the team and wild-battle routes in memory with the same contract as
  the Python routes (members and order only, turn numbers, 409s), playing turns with the TypeScript engine and a
  scriptable rng. Tests seed it instead of `localStorage`.
- **Why:** the existing battle tests encode a lot of exact game behavior (who moves first, damage, messages); keeping
  them meant giving them a server that plays the same game. The slice 3 golden battles already prove the two engines
  match.
- **Trade-off:** the fake could drift from the real API; its rules mirror the Python route tests.

## 2026-10-28: Slice 4b review fixes: resyncing, account switches, and the old local team

- **A lost answer resyncs from the server.** Any failed battle request other than a plain 400 refusal offers "Try
  again", which reloads the battle from the server instead of resending: the turn may have happened even though the
  answer never arrived (resending got a permanent 409). A finished battle is never resumed; Run waits for the server
  to abandon the battle before "Battle again".
- **Team requests are tied to the account they were made under.** Queued work carries a generation number and is
  dropped before it's sent (and its late answer ignored) if the signed-in user changed; a test fails without the check.
- **The team reloads when the tab comes back into view**, so a stale tab can't overwrite a creature caught or released
  in another tab by sending its old list.
- **The old browser-saved team (`pokemon-explorer:team` in `localStorage`) is no longer read.** There's no import:
  progress belongs to accounts now, and an import would let a client claim any levels it liked (see "The server owns a
  team's levels, XP and HP").

## 2026-10-29: Interactive API docs at /api/docs

- **What:** FastAPI's Swagger UI at `/api/docs` (spec at `/api/openapi.json`), with a summary for every route,
  `/api/pokemon`'s parameters and defaults, an example for every request body (one per battle action), every error
  response in the `{"error"}` shape, and an **Authorize** button for the Bearer token.
- **Why:** anyone (a reviewer, an interviewer, future me) can try the whole API from a browser: sign up, paste the
  token, build a team, start a battle and take turns, without reading code.
- **How, without changing behavior:** `/api/pokemon` still parses its query string by hand (repeated parameters stay a
  400), so its parameters are described with `openapi_extra`; battle actions stay a plain dict for the engine to
  validate, with their shapes and examples described the same way. `current_user` declares `HTTPBearer(auto_error=False)`
  only so the docs know about the token; it still reads the header itself, so error messages are unchanged. A test
  checks the spec stays complete and that the documented example move really works.
- **Rejected:** typed query and body models for documentation's sake (they'd replace this API's 400 messages with
  FastAPI's, breaking parity with the old API); ReDoc as well (one docs page is enough).

## 2026-10-29: Friend matches in Postgres: seats are users, turns under a row lock

- **What:** a `matches` row holds the whole match (both teams, pending actions, the engine's state as JSONB, presence).
  Seats are user ids from the token. Every action locks the row (`SELECT … FOR UPDATE`), stores the seat's pending
  action, and resolves the turn with the slice 3 engine when both are in.
- **Why:** both players can press Attack in the same instant. Without the lock, each request reads "the other hasn't
  moved", saves only its own move, and nobody resolves the turn. A test fires both moves at once for 20 rounds; with
  the lock removed it fails every time.
- **Rejected:** seat tokens (they worked without accounts; now the account is the seat, so a reload or another device
  keeps your place).

## 2026-10-29: Idempotency keys for match moves (turn numbers for wild battles)

- **What:** moves, switches and send-outs carry an `Idempotency-Key` header. The first successful action is recorded
  under it; a retry with the same key and body gets the same answer without being applied again; the same key with a
  different body is 409.
- **Why not a turn number, as wild battles use:** in a match two players act in the same turn, and a player's move
  stays pending until the other acts, so "is this the current turn?" can't tell a retry from a second move. A key
  identifies the request itself.
- **Trade-off:** one row per action in `match_actions` (deleted with the match).

## 2026-10-29: Live updates with LISTEN/NOTIFY, not a broker

- **What:** each API instance holds one `LISTEN match_events` connection. After an action commits, `NOTIFY` carries the
  match id; every instance with a stream for it re-reads the row and pushes each player their own view. A seat's
  current stream id lives in the row, so a reload on another instance replaces the old stream there too.
- **Why:** with two instances, the player who acted and the player waiting can be on different ones. The notification
  is only a hint: the data comes from the row, Postgres sends it only after the commit, and a lost one costs nothing a
  reconnect doesn't fix. So durable messaging isn't needed, and nothing new has to run.
- **Rejected:** RabbitMQ (durability, acks and retries for messages that are only hints, plus a service to run and
  defend); Redis pub/sub (one more service); sticky sessions (Cloud Run can't guarantee them, and they break when an
  instance scales away).
- **Trade-off:** notifications sent while an instance's listener is reconnecting are lost; streams on that instance
  catch up on the next change or reconnect.

## 2026-10-29: Presence by heartbeat, and a sweep that is safe to run twice

- **What:** an open stream marks its seat present and updates `seen_at` every 2 s; closing it records `left_at`. A
  sweep (every 5 s per instance, and first thing in every match route) marks a seat away after 5 s, forfeits it after
  60 s (from the later of the drop and the battle's start), deletes unstarted matches after 30 min and finished ones
  after 10 min. A stream silent for 10 s counts as dropped at its last heartbeat (its instance died without closing it).
- **Why:** every statement matches only rows that still need the change, so two instances sweeping at once can't
  forfeit twice: the second waits on the row lock, re-checks, and skips. A test runs two sweeps at once.
- **A bug the tests caught:** Postgres's `greatest()` ignores NULLs, so a connected seat (`left_at` NULL) looked like
  it had left at the battle's start; `gone` now requires `left_at` to be set.

## 2026-10-28: Pool connections autocommit, so route transactions commit before the response

- **What:** the connection pool opens connections with `autocommit=True`. A lone query commits on its own; a route's
  `async with conn.transaction()` is a real BEGIN/COMMIT.
- **Why:** without it, `current_user`'s query opened a transaction on the pooled connection before the route ran, so
  every route's `transaction()` was only a savepoint, and the real COMMIT ran when the pool took the connection back:
  after the response was sent. A review reproduced a `GET` right after a successful `PUT` returning the old team, and a
  client could be told 200 for a write whose commit then failed. Row locks still held to the late commit, so the
  turn check stayed correct. A test now asserts no transaction is open when a route starts.
- **Rejected:** keeping implicit transactions and committing in the dependency's teardown (it runs after the
  response is sent in this FastAPI version).
- **Trade-off:** every multi-statement write must be wrapped in `conn.transaction()` explicitly; a forgotten one
  commits statement by statement.

## 2026-10-29: Slice 5a review fixes: real disconnects, heartbeat gaps, a sturdier listener

- **A closed stream marks its seat dropped at once.** On a real server, a client disconnect cancels the stream
  generator, and the "dropped" write in its `finally` was cancelled with it; every tab close looked like a crashed
  instance (away after ~15 s instead of 5). That write is now shielded from the cancellation. Caught only against real
  uvicorn: a test now starts one.
- **A heartbeat restores presence.** If a stall (slow database, busy instance) let a sweep mark a still-open stream's
  seat away or gone, the next heartbeat brings it back and tells the opponent, instead of the player being forfeited
  while connected.
- **The listener survives a failed push and catches up after reconnecting.** A push error is logged instead of
  dropping the `LISTEN` connection (which lost every match's updates until it reconnected), and after each `LISTEN` it
  pushes every match it holds streams for.
- **The 4a fixes reached main here.** The review found route transactions committing after the response; the fix (an
  autocommit pool) had been made in slice 4a but pushed after that PR merged, so it never shipped. It's in this PR.

## 2026-10-29: The browser plays friend matches as its account; the stream takes the token in the URL

- **What:** create and join go through the signed-in account (`authFetch`); the per-match seat token the Express API
  handed out, and the browser kept in `sessionStorage`, is gone. Signed out, `/battle/vs` and an invite link show a
  sign-in link that comes back to the match.
- **The stream's token is a query parameter** (`/events?token=`), because the browser's `EventSource` can't send an
  `Authorization` header. The token expires after an hour, so the stream answers an expired or invalid token with an
  `unauthorized` event (sign in again) and only a stranger or a deleted match with `gone`. Merging the two would tell
  a player whose session lapsed mid-match that the match had ended.
- **A move's Idempotency-Key is made once per click** and reused when a dropped request is sent again, so the retry
  can't play the move twice.
- **Rejected:** a `fetch`-based SSE reader that can send headers (more code, and it gives up the browser's own
  reconnect, which is how a Cloud Run request timeout is survived); a short-lived stream ticket (another endpoint and
  table for the same hour-long risk).
- **Trade-off:** the token can land in access logs. It is the same token the browser already holds and it expires in
  an hour; a stream ticket is the upgrade if that ever matters.

## 2026-10-29: A friend match needs 15 minutes of sign-in left

- **What:** creating or joining a match asks you to sign in again first when your token expires within 15 minutes.
- **Why:** there's no refresh token. A token that expires mid-match makes the next move a 401, which signs you out;
  if signing back in takes longer than the 60 s disconnect window, you forfeit. Signing in again up front gives a
  fresh hour, longer than almost any match.
- **Rejected:** refresh tokens (the auth decision keeps one 1-hour token); a warning banner during the match (it still
  lets the match outlive the token); extending the token on every move (a sliding session is a refresh token by
  another name).
- **Trade-off:** someone 50 minutes into their session is asked to sign in again before a match. A match that runs
  past 15 minutes can still hit the expiry.

## 2026-10-29: CORS allows both of the frontend's Cloud Run URLs

- **What:** the API's allowed origins match the frontend at `<name>-ogxllptvoa-uc.a.run.app` and at
  `<name>-605570978921.us-central1.run.app`, plus the PR previews at either.
- **Why:** Cloud Run serves every service at both URLs. Only the first was allowed, so on the second every API call
  failed in the browser as "Failed to fetch" (a preflight from it got a 400 with no allow-origin header). A smoke test
  now sends a preflight from both.
- **Rejected:** reading the URLs from the frontend service's outputs (it would make the API's deploy depend on the
  frontend's); a wildcard on `*.run.app` (any Cloud Run app on the internet could call the API as a signed-in user's
  browser).

## 2026-10-29: Sign in before anything else

- **What:** signed out, every page except `/login` shows the sign-in screen (with "Create an account"); signing in
  carries on to the page you opened, so an invite link lands you in the match.
- **Why:** teams, battles and friend matches all need an account, and asking for one only when you first used them
  sent people to `/login` from four different places mid-click. One entry point is easier to follow. (Owner's call.)
- **Rejected:** keeping the catalog public and only smoothing the prompts (sign-in still appears in several places).
- **Kept:** each screen's own sign-in prompt. A session can expire while a page is open, and nothing re-renders the
  app when it does, so those prompts still catch it.
- **Trade-off:** a reviewer can't look at the catalog without making an account.

## 2026-10-30: Custom creatures are rows in pokemon, with an owner

- **What:** a Creature Lab creature is a `pokemon` row with `owner_id` set and an id from a sequence starting at
  1001 (never reused). Catalog rows have `owner_id IS NULL`. Teams and match lock-ins accept the catalog and your own
  creatures; anyone else's is "no such creature", and `GET /api/pokemon/{id}` is a 404 for it.
- **Why:** teams, wild battles and friend matches all look creatures up by id in `pokemon`. One table means they work
  for custom creatures without a second lookup path. A friend sees your creature in a match because the battle state
  carries the whole creature record.
- **Rejected:** a separate `creatures` table (every team and battle lookup would have to check two tables);
  mixing your creatures into `GET /api/pokemon`'s pages (the Explorer already shows them under their own filter,
  from `GET /api/creatures`).
- **Trade-off:** every catalog query needs `owner_id IS NULL`; forgetting it would show one user's creatures to
  others. Tests cover the list, the by-id lookup, teams, match lock-ins and the wild enemy.

## 2026-10-30: The lab's limits live in Postgres and are counted before the drawing

- **What:** each lab request adds a `lab_requests` row: at most 5 per user per hour and 100 a day overall, as the
  Express lab had. Failed and blocked drawings count too (each costs money). The count runs in its own transaction,
  under the user's row lock and an advisory lock for the daily total, and commits before the image is drawn.
- **Why:** the Express lab kept its counters in memory, so a deploy reset them and each instance counted
  separately. In Postgres they're shared and survive restarts. The locks stop two requests both seeing 4 and both
  taking the 5th. Committing first matters because a drawing takes seconds, and the user's row lock would stall
  their team edits and battles all that time.
- **Rejected:** keeping in-memory counters; holding one transaction across the drawing and the insert (simpler, but
  holds locks for seconds).
- **Trade-off:** a request that's counted and then fails still uses up a slot.

## 2026-10-30: Creature images in a public bucket

- **What:** generated images go to `finny-take-home-creature-images` as `creatures/<random uuid>.<ext>`, and the row
  stores the public URL. Anyone can read an object by name (`legacyObjectReader`), but nobody can list the bucket;
  only the API's service account writes and deletes.
  Deleting a creature deletes its image (best effort: a failure is logged and the creature is still deleted).
- **Why:** the browser loads images straight from the bucket, never through the API, as the spec says. The Express
  lab returned a base64 `data:` URL that the browser kept in IndexedDB, which only worked on that one device.
- **Rejected:** serving images through the API (each image view would use an API instance); signed URLs (they
  expire, and the cards are meant to be seen by friends in matches).
- **Trade-off:** anyone with an image's URL can see it. The names are random, so URLs can't be guessed.

## 2026-10-30: The API gets 60 seconds to start

- **What:** the API's startup probe allows 20 failures 3 seconds apart (about 60 s), up from 10 (about 30 s).
- **Why:** the first slice 6 deploy (revision `pokemon-api-00010`) failed its probe: for 27 s it printed nothing, not
  even uvicorn's "Started server process", so it was still importing Python modules. The previous revision took 6 s
  to reach that line. The Creature Lab added `google-genai` and `google-cloud-storage`, which roughly double import
  time (measured in the image: 5.3 s before, 10.8 s after, under emulation), and a fresh revision reads its files
  from a cold image. Cloud Run kept serving the previous revision, so nothing broke.
- **Rejected:** importing the Google libraries on the first lab request (faster start, but that request pays the
  import, and it hides a slow start instead of budgeting for it); startup CPU boost (costs money on every cold start).
- **Trade-off:** a revision that will never start takes about 60 s, not 30 s, to be rejected. If 60 s isn't enough
  either, the cause is something other than slow imports, and the next step is lazy imports with timing logs.

## 2026-10-30: The lab's Google clients are created on first use, not at startup

- **What:** the storage client and the Vertex AI client are created the first time a lab request needs them, on a
  worker thread, instead of when the app is built. `app/asgi.py` also logs each startup step with its time.
- **Why:** the 60-second probe budget (entry above) didn't fix the deploy: revision `pokemon-api-00011` also printed
  nothing for 60 s, so it was stuck, not slow. Imports alone take about 9 s in the image, and creating the clients is
  the only other new step before uvicorn starts. Creating a client looks up credentials over the network, and a
  lookup that stalls there stops every route from starting, not only the lab. The slow-imports explanation in the
  entry above was wrong.
- **Rejected:** a third, bigger probe budget (no evidence time would help); creating the clients at startup with a
  timeout (still delays every start to protect one feature).
- **Trade-off:** the first lab request after a start pays for the credentials lookup. Two first requests at once may
  each create a client; one is kept and the other is thrown away. The exact network call that stalled isn't
  confirmed; if a lab request now hangs instead, the logs will show it at that request.

## 2026-10-30: The frontend is a static Caddy container on its Cloud Run service

- **What:** the frontend's image is the Vite build served by Caddy (`Caddyfile`, `caddy:2.10.2-alpine`) on the same
  Cloud Run service Express used. Caddy falls back to `index.html` for app routes, answers `/api/health` for the probe,
  returns a JSON 404 for any other `/api` path and a plain 404 for a missing `/assets/*` file, caches found hashed
  assets for a year and `index.html` not at all. Express and `server/` are deleted; in dev, Vite proxies every `/api` request to FastAPI.
- **Why:** it changes only the container. The URL, the pipeline, PR previews and the API's CORS rule all stay as they
  are, and there is one small config file to explain. Nothing the frontend serves needs Node any more.
- **Rejected:** Firebase Hosting, because it adds a tool and a deploy step to CI, and a new URL means a CORS change;
  a Cloud Storage bucket behind Cloud CDN, because the load balancer costs about $18 a month and has the most parts.
- **Trade-off:** no CDN in front, so every visitor reaches the one region (us-central1). For a global audience,
  Firebase Hosting or Cloud CDN would be the next step.

## 2026-10-30: PR previews share the prod API and database

- **What:** each PR's preview deploys only its own frontend, built against the prod API (`pokemon-api`). Signing up,
  editing a team, battling or making a creature in a preview writes to the prod database and bucket.
- **Why:** a database per preview means a Cloud SQL instance (or a schema and migration run) per PR: minutes to
  create and a monthly cost each, for a project with one developer. The API's own changes are tested in CI against a
  real Postgres before they reach prod.
- **Rejected:** a Cloud SQL instance per preview (slow, costly); one shared staging database (needs its own API
  service and keeps drifting from prod); previews with no API (nothing past the catalog would work).
- **Trade-off:** test accounts, matches and creatures made in previews land in prod, and a preview can't try an API
  change. If more people worked on this, a staging API and database would be the next step.

## 2026-10-30: Catalog images are copied into the bucket

- **What:** `api/scripts/copy_catalog_images.py` (owner-run, re-runnable) copies each of the 1,000 catalog images into
  the creature bucket as `catalog/<id>.webp`: a sharp 640x640 WebP, cached for a year. Migration 0007 points the
  catalog rows there, and `pokemon.json` and the golden test files carry the same URLs. Migration 0002 keeps the
  original URLs, which the script reads.
- **Why:** the originals were placeholders on loremflickr.com and picsum.photos: slow, odd shapes up to about
  4000 px (some 3744x46), and loremflickr answers images with HTTP 500. The cards never showed them as they were:
  `cardImageUrl` rewrote every URL on each load (loremflickr to a picsum image seeded by its lock, picsum without its
  blur, at the size shown). The copies are those same photos, made once: each card keeps the photo players saw, it
  loads fast from our bucket, and `cardImageUrl` is gone.
- **Square, not the original shape:** shrinking the originals as they were gave strips like 640x8 that a 2:1 card
  blows up into a smear (about 40% of the catalog needed more than 2x enlargement). picsum crops a seed to any size,
  so the copy asks for a square, which the 2:1 card, the square battle sprite and the team picker all crop cleanly.
- **Rejected:** hotlinking the originals (slow, unreliable, odd shapes); resizing on the fly through an image proxy or
  CDN transform (more parts and cost for 1,000 images that never change); trying loremflickr first (if it recovered
  mid-run, a card would permanently get a different photo from the one players knew).
- **Trade-off:** the framing is a centre square, not the old per-view crop, so some cards are framed a little
  differently. Objects are cached as immutable and the script skips existing names, so a redo means a new prefix and
  a new migration, not an overwrite. A new catalog image means running the script again.

## 2026-10-30: Play as guest

- **What:** `POST /api/auth/guest` makes a throwaway account (`guest_` plus 8 random characters, a random password
  nobody is told, `is_guest` set) and returns the usual 1-hour token. The sign-in screen has a "Play as guest" button.
  Every instance's sweep deletes guests a day after they're made; their teams, battles, matches and creatures go with
  them through the existing cascades. At most 300 guests are made an hour, and signup refuses names starting with
  `guest_`.
- **Why:** reviewers and friends should be able to try everything (battles, friend matches, the Lab) without making
  an account. A guest is an ordinary user row, so no route, limit or ownership check changes.
- **Rejected:** letting the Explorer work signed out (the rest still needs an account, so it doesn't let anyone try
  battles); a separate guest mode in the browser (a second code path for every feature).
- **Trade-off:** a guest can't come back after its token expires (no password), and its data is gone a day later.
  Guests count against the Lab's daily total like anyone else; making many guests to get more drawings is capped by
  that total.
