# Backend decisions

The Express API is being rebuilt in Python (FastAPI) on Postgres. Each entry records one decision: what was chosen,
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
  keeps production matching `main` and always leaves a working URL. Supabase is free at this size and already
  familiar.
- **Rejected:** a long-lived `rebuild` branch merged at the end (one big-bang merge); Cloud SQL (stays inside GCP, but
  costs money even when idle); Neon (equivalent, less familiar).
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
