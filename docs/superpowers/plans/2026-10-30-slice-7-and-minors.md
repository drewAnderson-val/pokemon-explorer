# Slice 7 (Catalog Images) and the Deferred Minors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the 1,000 catalog images from the bucket, resized, and fix the deferred minors a player or an
operator would actually hit.

**Architecture:** An owner-run script copies each catalog image from its placeholder URL into the existing creature
bucket, as `catalog/<id>.webp`, no more than 640 px on its longest side. A migration then points the catalog rows at
those objects. The minors are independent fixes in the lab route, the friend-match client, the Lab screen and the
static container.

**Tech Stack:** Python 3.13, Pillow (dev only), google-cloud-storage, psycopg, FastAPI; React 19, Vitest; Caddy.

**Spec:** `docs/superpowers/specs/2026-10-26-fastapi-backend-design.md` (slice 7: "copy and resize into the
bucket"). The minors come from the deferred lists on PRs #34, #37, #38 and #42.

**Two PRs:**
- PR A is Tasks 1–2 (slice 7). It merges only after the owner has run the upload and its `--verify` reports
  1000/1000.
- PR B is Tasks 3–6 (the minors).

## Global Constraints

- **Object names:** `catalog/<id>.webp`, public URL `https://storage.googleapis.com/finny-take-home-creature-images/catalog/<id>.webp`.
- **Images:** WebP, quality 80, fit within 640×640, never upscaled. Keep `Cache-Control: public, max-age=31536000, immutable`, as lab images do.
- **The source list** is `api/app/db/migrations/0002_seed_pokemon.sql`. Applied migrations never change, so it is
  the permanent record of the original URLs.
- **The owner runs the upload** (`! cd api && uv run python scripts/copy_catalog_images.py ...`). I never run it
  against the bucket; dry runs write only to a local directory.
- **The rewrite is deterministic:**
  - `src/data/pokemon.json` and the golden files get only their `imageUrl`s rewritten, ids 1–1000, by the same
    function the migration's URL comes from.
  - This is not a regeneration. Never run `scripts/generate-pokemon.mjs`.
- **Dropped minors**, each with its reason, go in the PR B description:
  - 5b M1: joins keyed by match id.
  - 5b M3: error flash on a 401 join.
  - 6a M4: fixed by #41.
  - 6a M5: moot.
  - 6a M6: log noise.
  - 6b M3: cache not keyed by user.
  - 6b M5: the fake lab is deliberate.
  - 6b M7: Download filename.
  - 8: the `@/` alias.

## Review Focus

1. **A source that fails or never answers** (both placeholder hosts sometimes do): the script retries, then
   reports the id and moves on. It never aborts the batch, and a re-run uploads only what's missing.
2. **Extreme source shapes** (77×2039, 3972×205, already smaller than 640): the aspect ratio is kept, and nothing is
   upscaled.
3. **Merging before the upload has finished** would show broken images. `--verify` must report 1000/1000 first,
   and the deploy smoke test fetches one catalog image.
4. **The Vertex call hanging:** the request ends with a 503 within the timeout, holding no database connection.
5. **A friend-match stream that drops and keeps reconnecting** shows "Reconnecting…", not "live". A dead session
   sends you to sign in instead of leaving you stuck.

Focus 1–3 are tested in Tasks 1–2, 4 in Task 3, and 5 in Task 4.

---

### Task 1: The copy script

**Files:**
- Create: `api/scripts/copy_catalog_images.py`, `api/tests/test_copy_catalog_images.py`
- Modify: `api/pyproject.toml` (dev dependency `pillow`)

**Interfaces:**
- Produces:
  - `catalog_sources(seed_sql: str) -> dict[int, str]`
  - `resize_to_webp(data: bytes) -> bytes`
  - `catalog_url(pokemon_id: int) -> str`
  - `copy_all(sources, fetch, store, *, workers=8) -> CopyReport` (`CopyReport`: `uploaded`, `skipped`, `failed: dict[int, str]`)
  - CLI flags: `--dry-run DIR --limit N` (writes locally), `--verify` (counts objects), and none (uploads what's
    missing).

- [ ] **Step 1: Write the failing tests:**
  - `test_reads_all_1000_sources_from_the_seed`: run against the real `0002_seed_pokemon.sql`. Expect
    `len == 1000`, `sources[1]` equal to the seed's URL for id 1, and every value starting with `https://`.
  - `test_resize_keeps_shape_and_never_upscales`: Pillow-made inputs.
    - 3266×1298 gives 640×254.
    - 77×2039 gives 24×640.
    - 300×200 stays 300×200.
    - The output is WebP (`RIFF…WEBP`).
  - `test_catalog_url`: `catalog_url(7) == "https://storage.googleapis.com/finny-take-home-creature-images/catalog/7.webp"`.
  - `test_copy_skips_existing_retries_then_reports_failures`: a fake store that already has id 1, and a fake fetch
    that fails twice and then succeeds for id 2 but always fails for id 3. Expect `skipped == [1]`,
    `uploaded == [2]`, and `failed` keyed `{3}`, with the batch run to the end.
- [ ] **Step 2:** `cd api && uv run pytest tests/test_copy_catalog_images.py -q`. Expected: it fails because the
  module is missing.
- [ ] **Step 3: Implement.**
  - Parse the seed per line, with a regex anchored on `^\((\d+),` and the last `'https://…'` literal.
  - Fetch with `urllib` and a 20 s timeout, following redirects, with 3 attempts and backoff of 1 s then 3 s.
  - Upload with `BucketStore`-style `blob.upload_from_string`, the content type `image/webp`, and the cache header
    above.
  - Check existing objects in one `list_blobs(prefix="catalog/")` call.
  - At the end, print `uploaded/skipped/failed` and the failed ids.
- [ ] **Step 4:** Run the tests again. Expected: they pass. Then `uv run ruff check . && uv run ruff format --check .
  && uv run mypy`.
- [ ] **Step 5: Dry run.** `uv run python scripts/copy_catalog_images.py --dry-run <scratchpad>/catalog --limit 5`.
  Expected: 5 `.webp` files, each 640 px or less on its longest side. Look at two of them.
- [ ] **Step 6:** Commit: `A script that copies the catalog images into the bucket, resized`.

### Task 2: Point the catalog at the bucket

**Files:**
- Create: `api/app/db/migrations/0007_catalog_images.sql`
- Modify: `src/data/pokemon.json`, `api/tests/golden/pokemon_queries.json`, `api/tests/golden/battles.json` (`imageUrl` only)
- Modify: `.github/workflows/deploy.yml` (smoke), `AGENTS.md` (the `imageUrl` trap), `docs/backend/decisions.md`

- [ ] **Step 1: Write the failing test** `test_catalog_images_are_in_the_bucket` in `api/tests/test_pokemon_data.py`.
  After migrations:
  - every row with `owner_id IS NULL` has `image_url = catalog_url(id)`
  - custom creatures are untouched (insert one and check it)
- [ ] **Step 2:** Run it. Expected: it fails, showing the loremflickr or picsum URL.
- [ ] **Step 3: The migration.** One `UPDATE pokemon SET image_url = 'https://storage.googleapis.com/finny-take-home-creature-images/catalog/' || id || '.webp' WHERE owner_id IS NULL`.
- [ ] **Step 4: Rewrite the three JSON files' `imageUrl` for ids 1–1000** with a one-off Python snippet that uses
  `catalog_url`. It is not committed as a script. Then check the diff:
  `git diff --stat` shows only those files, and `git diff src/data/pokemon.json | grep '^[-+] ' | grep -v imageUrl`
  shows nothing.
- [ ] **Step 5:** Run the full API suite (`uv run pytest -q`), then `pnpm test`. Expected: all pass, including both
  golden tests.
- [ ] **Step 6: Smoke test.** Add a "Catalog images come from the bucket" step:
  `url=$(curl -fsS "$API_URL/api/pokemon/1" | jq -r .imageUrl)`, then
  `curl -fsSI "$url" | grep -qi '^content-type: image/webp'`.
- [ ] **Step 7: Docs.**
  - AGENTS.md's trap becomes: catalog images are bucket WebPs of at most 640 px; custom images come from the lab;
    keep the fixed aspect ratio, `loading="lazy"` and the fallback.
  - Add a decision entry: "Catalog images are copied into the bucket". Rejected: hotlinking (slow, random-sized,
    sometimes fail) and resizing on the fly (an image proxy, more cost).
- [ ] **Step 8:** Commit: `Serve the catalog's images from the bucket`.
- [ ] **Step 9: Hand off to the owner.**
  - Run the upload, then `--verify`.
  - Merge PR A only after it reports 1000/1000.

### Task 3: The lab route stops holding a connection and has a timeout (6a M1, M2, M3)

**Files:** `api/app/routes/creatures.py`, `api/app/lab/images.py`, `api/tests/test_creature_routes.py`

- [ ] **Step 1: Write the failing tests:**
  - `test_a_hung_drawing_is_503_within_the_timeout`: the fake generator sleeps forever, and the lab timeout is set
    to 0.2 s in the test. Expect 503 `{"error": "The lab is busy right now. Try again in a minute."}` within 2 s.
  - `test_the_drawing_holds_no_database_connection`: pool max_size=1 in a dedicated app. While the fake generator is
    held, `GET /api/pokemon?limit=1` returns 200 within 2 s.
  - `test_a_body_over_4kb_is_413_without_reading_it`: a `Content-Length: 1000000` header with a small streamed
    body gives 413.
  - `test_a_failed_save_deletes_the_uploaded_image`: make the insert fail (a monkeypatched sequence name, or a
    trigger). Expect 502, and `store.deleted == [the uploaded url]`.
- [ ] **Step 2:** Run them. Expected: all four fail, for the reasons in their names.
- [ ] **Step 3: Implement.**
  - The route takes the pool, not the `Conn` dependency. It opens one short `async with pool.connection()` to take
    the slot and another to insert.
  - `asyncio.timeout(lab_timeout)` wraps the generator call. `lab_timeout` lives on `Lab`, default 90 s; on timeout,
    raise `ImageBusy`.
  - Reject on `Content-Length` > 4 KB before reading. Read the stream with a running cap.
  - Wrap the insert: on failure, delete the image best-effort, log, and return 502.
- [ ] **Step 4:** Full API suite plus ruff/mypy. Expected: all pass.
- [ ] **Step 5:** Commit: `The lab holds no database connection while drawing, and gives up after 90 seconds`.

### Task 4: Friend matches: lost lock-ins, reconnecting, backoff, sign-out (5b M2, M4, M5, M6)

**Files:** `src/lib/versus-api.ts`, `src/hooks/useMatch.ts`, the status copy in `src/screens/VersusScreen.tsx`, and
their tests

- [ ] **Step 1: Write the failing tests:**
  - **versus-api:**
    - A `team` action gets an `Idempotency-Key`, and a dropped first request is retried with the same key.
    - The retry waits about 500 ms; use fake timers to show it isn't sent before 500 ms.
  - **useMatch:**
    - An `error` event while `readyState === CONNECTING` sets status `reconnecting`, and the next `view` sets
      `live`.
    - `unauthorized` calls `logout()` (the session is cleared).
  - **VersusScreen:** status `reconnecting` shows "Reconnecting…".
- [ ] **Step 2:** Run them. Expected: they fail.
- [ ] **Step 3: Implement.**
  - Add `team` to the keyed actions. Wait 500 ms before the one retry.
  - Add `'reconnecting'` to `MatchStatus`. Set it on a non-closed `error`; a `view` resets it to `live`.
  - On `unauthorized`, call `logout()`; the App gate then shows the login, with `next` set to this match.
  - The server already honours a key on any action. Add an API test confirming that a replayed `team` key returns
    the stored status.
- [ ] **Step 4:** `pnpm lint && pnpm test`, plus that API test. Expected: all pass.
- [ ] **Step 5:** Commit: `Friend matches: retry lock-ins safely, show reconnecting, sign out when the session ends`.

### Task 5: The Lab's "+ Team" waits for the team and shows team errors (6b M4, M6)

**Files:** `src/components/CreationCard.tsx`, `src/screens/CreatorScreen.tsx`, `CreatorScreen.test.tsx`

- [ ] **Step 1: Write the failing tests:**
  - Before the team loads (the fake server's `/api/team` held), "+ Team" is disabled.
  - A team save the server refuses shows its message in the Lab's alert, the same way a refused delete does.
  - "+ Team" then "Delete" on the same card: whatever the team store reports is shown, and nothing fails silently.
- [ ] **Step 2:** Run them. Expected: they fail.
- [ ] **Step 3: Implement.**
  - Read `loaded` and `error` from the team status (`useTeamStatus`).
  - Disable "+ Team" until it's loaded.
  - Show `error` in the existing alert region.
- [ ] **Step 4:** `pnpm lint && pnpm test`. Expected: all pass.
- [ ] **Step 5:** Commit: `The Lab's + Team waits for your team and shows team errors`.

### Task 6: Static container, pipeline and docs leftovers (slice 8 minors)

**Files:** `Caddyfile`, `Dockerfile`, `.github/workflows/deploy.yml`, `src/lib/query.golden.test.ts` (new),
`infra/index.ts`, `docs/backend/decisions.md`, `docs/FINNY-requirements.md`, `AGENTS.md`

- [ ] **Step 1: The TypeScript catalog golden test** `src/lib/query.golden.test.ts`. It replays
  `api/tests/golden/pokemon_queries.json`'s queries through `parsePokemonQuery` + `queryPokemon` over `pokemon.json`
  and compares the results, with no write path. Run it. Expected: it passes, since this is a new guard over
  existing code.
- [ ] **Step 2: Container.**
  - `handle /api /api/*` in the Caddyfile.
  - `RUN test -n "$VITE_API_URL" || (echo "VITE_API_URL is required" && exit 1)` in the Dockerfile before
    `pnpm build`.
  - RED first: build without the argument and see it succeed; then add the guard and see it fail with the message.
    Build with the argument and check that `/api` is a 404 JSON, where it was 200 before.
- [ ] **Step 3: Smoke test.** The `/api/nope` step also checks
  `jq -e '.error == "Not found"'`.
- [ ] **Step 4: Docs.**
  - Fix the `infra/index.ts` comment: previews call the prod API, and signing up or playing there writes to the
    prod database.
  - Add a decision entry: "PR previews share the prod API and database". Rejected: a database per preview (a Cloud
    SQL instance each, slow and costly). Trade-off: test accounts and matches from previews land in prod.
  - Put a one-line "superseded" note at the top of `docs/FINNY-requirements.md` about `server/`, pointing to `api/`.
  - AGENTS.md's local check passes `--build-arg VITE_API_URL=http://localhost:8000`.
- [ ] **Step 5:** `pnpm lint && pnpm test && pnpm build`, plus `cd infra && pnpm types`. Expected: all pass.
- [ ] **Step 6:** Commit: `Tidy the cutover: bare /api, required API URL, a TS catalog golden check, preview docs`.
