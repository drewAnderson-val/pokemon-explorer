# Slice 6: Creature Lab on the server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Custom creatures live in Postgres, tied to the account that made them, with their images in a Cloud Storage
bucket, so they show up on every device and can join teams, wild battles and friend matches.

**Architecture:** Custom creatures are rows in `pokemon` with an `owner_id` and ids from 1001 up (a sequence).
`POST /api/creatures` ports `server/create.ts` and `server/image-generator.ts`: parse, rate-limit in Postgres, draw the
image with Vertex AI, upload it to the bucket, store the row. The browser's IndexedDB store goes away and the Lab,
Explorer and team picker read the user's creatures from the API. Two PRs, as in slice 5: **6a** (API and infra), then
**6b** (browser).

**Tech Stack:** FastAPI, psycopg 3, `google-genai` (Vertex AI, async client), `google-cloud-storage`, Pulumi, React 19
+ TanStack Query.

**Spec:** `docs/superpowers/specs/2026-10-26-fastapi-backend-design.md` (sections: Data model, API, Creature Lab;
build order step 6).

## Global Constraints

- Rate limits as today: **5 per user per hour, 100 per day overall** (`server/app.ts:41-42`). Attempts count, not
  only successes: a blocked image costs money too.
- Request limits as today: name ≤ **30** chars, description ≤ **200**, **1–2** types from the 18 in
  `api/app/engine/type_chart.py:POKEMON_TYPES`; body ≤ **4 KB** (413 above).
- Stat rolls as today (`server/create.ts:rollCreature`): attack, defense, specialAttack, specialDefense, speed 20–150;
  hp 30–150; height 3–30 /10; weight 10–1500 /10; `generation: 10`; `isLegendary: false`; default description
  `A newly discovered <Type/Type>-type creature.`
- Error copy as today: 429 `You've made a lot of creatures! Try again in an hour.` / `The creature lab is closed for
  today. Come back tomorrow!`; 503 `The creature lab is not configured here.`; 503 + `Retry-After: 60` `The lab is
  busy right now. Try again in a minute.`; 422 `That creature couldn't be drawn. Try a different idea.`; 502 `The
  drawing machine jammed. Try again.`
- Image model `IMAGE_MODEL` env, default `gemini-3.1-flash-lite-image`, Vertex `location="global"`, aspect 1:1,
  `personGeneration: ALLOW_NONE`, prominent people blocked, every safety category at `BLOCK_LOW_AND_ABOVE`
  (`server/image-generator.ts`).
- A creature someone else owns is **404**, never 403 (spec, "Participant check").
- Custom ids start at **1001** and are never reused (a sequence).
- Errors are `{"error": "..."}`. Every multi-statement write is inside `conn.transaction()` (the pool autocommits).
- No migration of IndexedDB creations: they were never tied to an account (spec).
- New Python dependencies: only `google-genai` and `google-cloud-storage` (both Google's own).

## Review Focus

1. **Someone else's creature id** in `PUT /api/team`, a match lock-in or `GET /api/pokemon/{id}`: treated as if it
   didn't exist (400 for the team ("No such creature"), 404 for the lookup). Tests in Tasks 1 and 3.
2. **Deleting a creature that's on your team or locked into a friend match:** it leaves the team; a match that hasn't
   finished refuses the delete with 409 (the match would fail to start without it). Tests in Task 3.
3. **A slow image call holding a lock:** the rate-limit transaction commits *before* the Vertex call, so one user's
   10-second drawing never blocks anyone's team or battle. Test in Task 3.
4. **Two requests racing the limit** (the 5th and 6th at once): exactly one gets through. Test in Task 3.
5. **The wild enemy is never another player's creature:** the enemy pick is catalog-only. Test in Task 1.

---

### Task 1: Custom creatures in `pokemon`, owner-aware reads (6a)

**Files:**
- Create: `api/app/db/migrations/0006_creatures.sql`
- Modify: `api/app/pokemon/queries.py`, `api/app/routes/pokemon.py`, `api/app/routes/team.py:45,76`,
  `api/app/routes/matches.py:193`, `api/app/routes/wild.py:71`
- Test: `api/tests/test_creatures_schema.py`, additions to `test_pokemon_routes.py`, `test_team_routes.py`,
  `test_match_routes.py`, `test_wild_routes.py` (use the files' existing names)

**Interfaces:**
- Produces: `pokemon.owner_id uuid NULL REFERENCES users ON DELETE CASCADE`, `pokemon.created_at timestamptz`,
  sequence `pokemon_custom_id_seq START 1001`; `team_members.pokemon_id` FK becomes `ON DELETE CASCADE`;
  table `lab_requests (user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE, created_at timestamptz NOT NULL
  DEFAULT now())` with an index on `created_at`.
- Produces: `find_by_id(conn, pokemon_id, viewer: UUID | None) -> dict | None` (catalog, or the viewer's own);
  `find_usable(conn, ids: list[int], user_id: UUID) -> dict[int, dict]` (catalog or owned by `user_id`);
  `find_many` unchanged (internal loads of ids already validated, such as the opponent's locked-in team).
- Ruling for the owner: `GET /api/pokemon` stays catalog-only. The spec says "plus the caller's own creatures", but
  the Explorer already shows your creatures under their own filter, so mixing them into the catalog's pages would
  show them twice. `GET /api/creatures` (Task 3) lists them.

- [ ] **Step 1: Write the failing tests**
  - `test_custom_ids_start_at_1001_and_are_not_reused`: insert two owned rows via `nextval`, delete the second,
    insert again → ids `1001, 1002, 1003`.
  - `test_deleting_a_creature_takes_it_off_teams` (cascade).
  - `test_your_creature_by_id` → 200 with the token; `test_someone_elses_creature_is_404` (another user's token, and
    no token) → 404 `No creature #<id>`.
  - `test_the_catalog_list_leaves_custom_creatures_out` → `total == 1000` with a custom row present.
  - `test_a_team_cant_use_someone_elses_creature` → `PUT /api/team` 400 `No such creature`; with your own → 200.
  - `test_a_match_team_cant_use_someone_elses_creature` → 400; your own → 204, and the opponent's view shows it once
    the battle starts.
  - `test_the_wild_enemy_is_never_a_custom_creature`: rng `0.999` (last id) with a custom row present → enemy id
    `1000`.
- [ ] **Step 2: Run** `cd api && uv run pytest -q tests/test_creatures_schema.py` and the route files. Expected: FAIL
  (no column / no sequence / custom rows leak).
- [ ] **Step 3: Implement** the migration and the reads above. Catalog list and wild pick add `owner_id IS NULL`.
  The team and match routes validate with `find_usable(..., user.id)`; the match route keeps `find_many` for loading
  both teams when the second locks in.
- [ ] **Step 4: Run** the full API suite: `uv run ruff check . && uv run mypy && uv run pytest -q`. Expected: all pass.
- [ ] **Step 5: Commit** `Store custom creatures in pokemon, visible only to their owner`.

### Task 2: The lab's parts: request, prompt, stats, image, storage (6a)

**Files:**
- Create: `api/app/lab/request.py`, `api/app/lab/images.py`, `api/app/lab/storage.py`
- Modify: `api/pyproject.toml` (`google-genai`, `google-cloud-storage`), `api/app/config.py`
- Test: `api/tests/test_lab_request.py`, `api/tests/test_lab_images.py`

**Interfaces:**
- Produces (`request.py`): `CreatureRequest(name: str, types: list[str], description: str)` (dataclass);
  `parse_creature_request(body: object) -> CreatureRequest | str` (str = the 400 message, same text as
  `parseCreatureRequest`); `build_prompt(req) -> str` (same text as `buildPrompt`); `roll_creature(req, image_url,
  rng: Callable[[], float]) -> dict` (camelCase, no `id`; same ranges and the same order of draws as `rollCreature`).
- Produces (`images.py`): `GeneratedImage(data: bytes, mime_type: str)`; `ImageBlocked(Exception)`,
  `ImageBusy(Exception)`; `class ImageGenerator(Protocol): async def __call__(self, prompt: str) -> GeneratedImage`;
  `vertex_generator(project: str, model: str) -> ImageGenerator` (async client `client.aio.models.generate_content`);
  `read_response(response) -> GeneratedImage` (raises `ImageBlocked` on a block reason or a blocked finish reason,
  `ValueError` when there's no image). A 429 from Vertex → `ImageBusy`.
- Produces (`storage.py`): `class ImageStore(Protocol): async def save(self, data: bytes, mime_type: str) -> str`
  (public URL) and `async def delete(self, url: str) -> None`; `bucket_store(bucket: str) -> ImageStore`. Objects are
  `creatures/<uuid4>.<png|jpg|webp>`, `Cache-Control: public, max-age=31536000, immutable`; URL
  `https://storage.googleapis.com/<bucket>/<name>`. The storage client is synchronous: run its calls with
  `anyio.to_thread.run_sync`.
- Produces (`config.py`): `Settings.google_cloud_project: str | None`, `creature_bucket: str | None`,
  `image_model: str = "gemini-3.1-flash-lite-image"` from `GOOGLE_CLOUD_PROJECT`, `CREATURE_BUCKET`, `IMAGE_MODEL`.

- [ ] **Step 1: Write the failing tests**: port each case in `server/create.test.ts` (tidying, every 400 message,
  the prompt text with and without a description, rolls within range plus the default description).
  `test_rolls_draw_in_the_same_order_as_the_express_lab`: a scripted rng `[0, 0.5, 0.999, …]` gives the values the TS
  `rollCreature` gives for the same sequence (compute them once with `pnpm vitest` or by hand, and paste them in).
  For `read_response`: a blocked prompt, a `SAFETY` finish reason, no image → the right exception; an image part →
  `GeneratedImage` with decoded bytes.
- [ ] **Step 2: Run** `uv run pytest -q tests/test_lab_request.py tests/test_lab_images.py`. Expected: FAIL (import).
- [ ] **Step 3: Implement.** `uv add google-genai google-cloud-storage`. No network in tests: the Vertex and bucket
  adapters are only constructed in `create_app` when configured.
- [ ] **Step 4: Run** the full API suite. Expected: all pass.
- [ ] **Step 5: Commit** `Port the creature lab's request, prompt, stats and image calls`.

### Task 3: `/api/creatures` routes and limits (6a)

**Files:**
- Create: `api/app/routes/creatures.py`, `api/app/lab/limits.py`
- Modify: `api/app/main.py` (`create_app(settings, lab: Lab | None = None)`; register the router), `api/app/docs.py`
  as needed, `api/tests/test_openapi.py`
- Test: `api/tests/test_creature_routes.py`

**Interfaces:**
- Consumes: Task 1 schema; Task 2 `parse_creature_request`, `build_prompt`, `roll_creature`, `ImageGenerator`,
  `ImageStore`, `ImageBlocked`, `ImageBusy`.
- Produces: `Lab(generator: ImageGenerator, store: ImageStore)` dataclass at `app.state.lab` (`None` when
  `GOOGLE_CLOUD_PROJECT` or `CREATURE_BUCKET` is missing); `take_lab_slot(conn, user_id) -> str | None` (the 429
  message, or None after inserting a `lab_requests` row: lock the user row `FOR UPDATE`, then
  `pg_advisory_xact_lock` on a fixed key for the global count, count the last hour for the user and the last 24 hours
  overall, insert).
- Routes:
  - `POST /api/creatures` (auth) → **201** `{"creature": <Pokemon with id>}`. Order: 413/400 → 503 not configured →
    limits in their own transaction, **committed before the image call** → generate → `store.save` → insert the
    row with `nextval('pokemon_custom_id_seq')`, `owner_id`. Errors as in Global Constraints; a save failure is 502.
  - `GET /api/creatures` (auth) → `{"data": [...]}`, your creatures newest first.
  - `DELETE /api/creatures/{id}` (auth) → **204**; 404 if not yours (or catalog); **409** `That creature is in a
    friend match` when it's in `host_team`/`guest_team` of a match whose `outcome IS NULL`. Lock the user row first
    (the team route's lock), delete the row (the team cascade follows), commit, then `store.delete(url)` (logged,
    never fails the request).

- [ ] **Step 1: Write the failing tests** with a fake generator (returns PNG bytes, or raises on cue) and a fake store
  (records saves and deletes): create → 201 and the row exists with your `owner_id`; each error status and message
  in Global Constraints; 401 without a token; the 6th request in an hour → 429 (and a blocked image still counts);
  the 101st of the day → 429; `test_two_racing_requests_take_one_last_slot` (4 used, 2 at once via
  `asyncio.gather` → one 201, one 429); `test_the_image_call_holds_no_lock` (while a fake generator waits on an
  event, `PUT /api/team` for the same user completes); list order; delete (204, gone from team, image deleted);
  delete someone else's → 404; delete one locked into an unfinished match → 409; a finished match → 204.
- [ ] **Step 2: Run** `uv run pytest -q tests/test_creature_routes.py`. Expected: FAIL (404 route).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the full API suite plus mutation checks: drop the advisory lock → the race test fails; move the
  image call inside the limit transaction → the lock test fails. Expected: suite passes; each mutation fails its test.
- [ ] **Step 5: Commit** `Make creatures on the server: POST, GET and DELETE /api/creatures`.

### Task 4: Bucket, permissions and deploy (6a)

**Files:**
- Modify: `infra/bootstrap/index.ts` (owner-run), `infra/index.ts` (API env), `.github/workflows/deploy.yml` (smoke
  test), `vite.config.ts` (`/api/creatures` to FastAPI), `docs/backend/decisions.md`

**Interfaces:**
- Produces: bucket `<project>-creature-images` (uniform access, `protect: true`, public read via `allUsers` →
  `roles/storage.objectViewer`); `pokemon-api-run` gets `roles/storage.objectAdmin` on that bucket and
  `roles/aiplatform.user` on the project. The API service gets `GOOGLE_CLOUD_PROJECT`, `CREATURE_BUCKET`.

- [ ] **Step 1:** Add the resources; `cd infra/bootstrap && pnpm types` and `pulumi preview` (Expected: 1 bucket, 3
  IAM members to create, nothing else). **The owner runs `pulumi up` on bootstrap** before merging 6a. If the org
  policy refuses public access (`allUsers`), stop and ask: the fallback is serving images through the API.
- [ ] **Step 2:** API env vars; `cd infra && pnpm types` and `pulumi preview --stack prod --diff` (Expected: only the
  API service's env changes, plus image rebuilds).
- [ ] **Step 3:** Smoke tests: `POST /api/creatures` → 401, `GET /api/creatures` → 401 (no smoke test creates a
  creature: it costs money and writes to prod).
- [ ] **Step 4:** Decision entries: creatures in `pokemon` with `owner_id` (rejected: a separate table, which would
  split every team and battle lookup); limits in Postgres (rejected: in-memory counters, which reset on deploy and
  differ per instance); the lock is released before the image call; `GET /api/pokemon` stays catalog-only.
- [ ] **Step 5:** Merge `main`, full API suite, PR **6a**, fresh review, fix pass, confirm the fixes reach `main`.

### Task 5: The browser uses the server's creatures (6b)

**Files:**
- Create: `src/lib/creatures-api.ts`
- Modify: `src/hooks/useCreations.ts`, `src/hooks/useTeamCreatures.ts`, `src/lib/api.ts` (`fetchPokemonById` via
  `authFetch`), `src/screens/CreatorScreen.tsx`, `src/screens/VersusScreen.tsx:129,239`,
  `src/screens/BattleScreen.tsx:74`, `src/lib/creature.ts`, `src/test/fake-server.ts`
- Delete: `src/lib/creation-store.ts`, the `fake-indexeddb` dev dependency and its setup import
- Test: `src/hooks/useCreations.test.ts`, `src/screens/CreatorScreen.test.tsx`, `src/screens/VersusScreen.test.tsx`

**Interfaces:**
- Consumes: Task 3 routes and shapes.
- Produces: `listCreations(): Promise<Pokemon[]>`, `createCreature(req: CreatureRequest): Promise<Pokemon>`,
  `deleteCreature(id: number): Promise<void>` (all `authFetch`; errors carry the API's message). `useCreations()`
  keeps its return shape, with `add` replaced by the created `Pokemon` going into the cache; its query key includes
  the user id. Deleting reloads the team (the server already removed the creature from it).

- [ ] **Step 1: Write the failing tests:** the Lab lists creatures from the API; making one posts and shows the
  returned card (with its server id) flipped in; deleting calls `DELETE` and the card leaves the team picker; a
  custom creature can be picked for a friend match (the custom tab is there, nothing is filtered out); a new account
  sees an empty Lab (no IndexedDB leftovers).
- [ ] **Step 2: Run** the files. Expected: FAIL.
- [ ] **Step 3: Implement.** Remove every `isCustomId` gate, `allowCustom={false}`, and the IndexedDB store.
  `FIRST_CREATION_ID`/`isCustomId` stay only if something still needs them (the Explorer's custom filter doesn't:
  it reads `useCreations`).
- [ ] **Step 4: Run** `pnpm lint && pnpm vitest run --exclude '.claude/**' && pnpm build`. Expected: all pass.
- [ ] **Step 5: Commit** `Read and make creatures through the API`.

### Task 6: Ship 6b

- [ ] Dev check: make a creature with the dev API (needs `gcloud auth application-default login` and the bucket),
  put it on the team, win a wild battle with it, lock it into a friend match against a second account.
- [ ] Interview questions: why the limit transaction commits before the image call; how a race on the last slot is
  stopped; why someone else's creature is a 404; why the images are public and what that costs.
- [ ] Merge `main`, PR **6b**, fresh review, fix pass; after merge, watch the deploy. Live check (owner): make one
  creature on the site and battle with it.
- [ ] Walkthrough (owner): trace one `POST /api/creatures` from the button to the bucket and back.
