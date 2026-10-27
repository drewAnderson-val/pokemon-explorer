# API slice 1: Pokémon in Postgres — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The 1,000 Pokémon live in a Postgres table, FastAPI serves `GET /api/pokemon` (same parameters, errors and
response as Express today) and `GET /api/pokemon/{id}`, and the live Explorer reads from the new API.

**Architecture:** Two migrations: the `pokemon` table with its indexes, and a seed generated once from
`src/data/pokemon.json`. A parse function ports `parsePokemonQuery`; a query module builds parameterized SQL. Parity
with Express is proven by a shared golden file: the TypeScript suite checks the old `queryPokemon` against it and the
Python suite checks the new route against it. The frontend calls `${VITE_API_URL}/api/...`; in dev, Vite proxies
`/api/pokemon` to FastAPI; in prod, the API allows the frontend's origins (CORS).

**Tech Stack:** FastAPI, psycopg 3 (async), Postgres 17 + `pg_trgm`, pytest; React/Vite/Vitest; Pulumi; GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-26-fastapi-backend-design.md` (Data model: `pokemon`; API: the two Pokémon
rows; Slices: 1). Decisions: `docs/backend/decisions.md`. Previous slice:
`docs/superpowers/plans/2026-10-26-api-slice-0-skeleton.md`.

## Global Constraints

- Same behavior as `server/query.ts`: params `page`, `limit` (default 20, max 100), `search` (trimmed, max 100 chars,
  one value), `sort` (`id` | `total` | `speed`), `type` (case-insensitive, one of the 18 in `src/lib/pokemon.ts`).
  400 `{"error": "<same message as query.ts>"}` on bad input; 200 with `data: []` past the last page.
- Response shape is exactly today's: `{data, pagination: {hasNext, hasPrev, limit, page, total, totalPages}}`, records
  in camelCase, `isLegendary` present only on records that have it in `pokemon.json` (52 of 1,000, all `true`).
- Search matches name, any type, or description, case-insensitively, as a **literal** substring.
- Hand-written SQL, every value passed as a parameter, never formatted into the string.
- Express keeps its `/api/pokemon` until slice 8 (the deploy smoke test and PR previews still use it).
- No new runtime dependencies in the API.

## Review Focus

1. **`%` or `_` in the search box.** In SQL `LIKE` they are wildcards; today they're literal, so `search=%` matches
   nothing. Must stay that way. (Task 4: golden cases `search=%` and `search=_`, and a test with `\`.)
2. **Repeated parameters** (`?search=a&search=b`, `?page=1&page=2`). Today `search` repeated is a 400. FastAPI's
   `request.query_params[...]` silently takes the last value. (Task 3 tests.)
3. **Tie order in sorts.** Many Pokémon share a stat total or speed; paging must be stable or infinite scroll shows
   duplicates and gaps. Ties break by id. (Task 4 golden cases page 2 and 3 of `sort=total`.)
4. **Running tests wipes the dev database.** Tests drop `public` in the database they use; dev data must live in a
   different database. (Task 1: dev uses database `pokemon`, tests use `postgres`.)
5. **A CORS origin that's almost right** (`https://evil.com/pokemon-explorer-…`, or `…run.app.evil.com`). The origin
   pattern must be anchored at both ends. (Task 5 test.)

## Files

| Path | Responsibility |
| --- | --- |
| `api/app/db/migrations/0001_pokemon.sql` | Table, `total_stats` column, indexes, `pg_trgm` |
| `api/scripts/generate_seed.py` | Writes `0002_seed_pokemon.sql` from `src/data/pokemon.json` |
| `api/app/db/migrations/0002_seed_pokemon.sql` | Generated; 1,000 rows |
| `api/app/pokemon/params.py` | `parse_pokemon_query`: query string → `PokemonQuery` or error message |
| `api/app/pokemon/queries.py` | SQL: one page and its total; one by id |
| `api/app/routes/pokemon.py` | The two routes |
| `api/tests/golden/pokemon_queries.json` | Golden responses, written by the TypeScript suite |
| `server/golden.test.ts` | Checks Express's `queryPokemon` against the golden file (`UPDATE_GOLDEN=1` rewrites it) |
| `src/lib/api.ts`, `src/test/fake-api.ts` | API base URL; `fetchPokemonById` uses the new route |
| `vite.config.ts`, `package.json` | Dev proxy for `/api/pokemon`; `dev:api` script |
| `Dockerfile`, `infra/index.ts` | `VITE_API_URL` build arg; API `CORS_ORIGIN_REGEX` env |
| `docker-compose.yml` | `POSTGRES_DB=pokemon` for dev |

---

### Task 1: Table and seed

**Files:**
- Create: `api/app/db/migrations/0001_pokemon.sql`, `api/scripts/generate_seed.py`,
  `api/app/db/migrations/0002_seed_pokemon.sql` (generated), `api/tests/test_pokemon_data.py`
- Modify: `docker-compose.yml` (`POSTGRES_DB: pokemon`), `api/app/db/migrations/.gitkeep` (delete)

**Interfaces:**
- Produces: table `pokemon(id int PK, name text, types text[], hp, attack, defense, special_attack,
  special_defense, speed int, height, weight double precision, description text, generation int, image_url text,
  is_legendary boolean NULL, total_stats int GENERATED ALWAYS AS (hp + attack + defense + special_attack +
  special_defense + speed) STORED)`, all `NOT NULL` except `is_legendary`. Indexes: GIN `pg_trgm` on `lower(name)` and
  `lower(description)`; GIN on `types`; btree `(total_stats DESC, id)` and `(speed DESC, id)`.
  `generate_seed.render(records: list[dict]) -> str` returns the SQL text; `main()` writes the file.

`0001` starts with `CREATE EXTENSION IF NOT EXISTS pg_trgm;`. The seed is one `INSERT … VALUES` statement, values
rendered as SQL literals (strings with `'` doubled, `types` as `ARRAY['Fire','Water']`, floats with `repr`, missing
`isLegendary` as `NULL`), rows in id order, a header comment saying it's generated and how.

- [ ] **Step 1: Write the failing tests** in `api/tests/test_pokemon_data.py`

```python
async def test_seed_loads_every_record_unchanged(conn):
    await migrate(conn)
    source = json.loads(POKEMON_JSON.read_text())  # repo-root src/data/pokemon.json
    rows = await fetch_all_as_camel_case(conn)  # test helper: SELECT … ORDER BY id, mapped to the JSON shape
    assert len(rows) == 1000
    assert rows == source  # floats, types order, isLegendary presence all exact

async def test_total_stats_is_the_sum_of_six_stats(conn): ...  # id 1: 28+128+162+193+140+132 = 783

def test_seed_file_is_up_to_date():
    assert render(json.loads(POKEMON_JSON.read_text())) == SEED_FILE.read_text()

def test_render_escapes_quotes():
    sql = render([record(name="Farfetch'd")])
    assert "'Farfetch''d'" in sql
```

- [ ] **Step 2: Run, verify FAIL** — `cd api && uv run pytest tests/test_pokemon_data.py -q` — import error / no table.

- [ ] **Step 3: Implement** the migration and generator; run `uv run python scripts/generate_seed.py`.

- [ ] **Step 4: Verify** — `uv run pytest -q` all pass; ruff, mypy clean. `docker compose down && docker compose up
  -d --wait db` then `psql postgresql://postgres:postgres@localhost:54329/pokemon -c '\l'` lists `pokemon`.

- [ ] **Step 5: Commit** — `"Add the pokemon table, seeded from pokemon.json"`

---

### Task 2: Golden file from the Express implementation

**Files:**
- Create: `server/golden.test.ts`, `api/tests/golden/pokemon_queries.json` (generated)

The golden file is a JSON array of `{ "query": {<raw query params as strings>}, "status": 200|400, "body": … }`,
computed with `parsePokemonQuery` + `queryPokemon` over `pokemon.json`. Cases (exact list):

```
{}                                   {page: "2"}                         {page: "51"}  (past the end: 1,000 / 20 = 50 pages)
{limit: "100"}                       {search: "fire"}                    {search: "  FIRE "}
{search: "%"}                        {search: "_"}                       {search: "o", page: "3", limit: "7"}
{type: "fire"}                       {type: "Water", search: "a"}        {sort: "total"}
{sort: "total", page: "2"}           {sort: "total", page: "3"}          {sort: "speed", type: "Dragon"}
{limit: "0"}                         {limit: "101"}                      {page: "abc"}
{sort: "name"}                       {type: "Plasma"}                    {search: "<101 × a>"}
```

`it('matches the golden file')`: compute all cases; with `UPDATE_GOLDEN=1` write the file (2-space JSON, trailing
newline), otherwise `expect(computed).toEqual(JSON.parse(file))`.

- [ ] **Step 1: Write the test; run without the file** — `pnpm vitest run server/golden.test.ts` — FAIL (no file).
- [ ] **Step 2: Generate** — `UPDATE_GOLDEN=1 pnpm vitest run server/golden.test.ts`, then run again without the
  variable — PASS. Check the file: `search=%` and `search=_` have `total: 0`; `page=51` has `data: []`.
- [ ] **Step 3: Verify** — `pnpm lint && pnpm test` green.
- [ ] **Step 4: Commit** — `"Record Express's pokemon query results as a golden file"`

---

### Task 3: Parsing the query string

**Files:**
- Create: `api/app/pokemon/__init__.py`, `api/app/pokemon/params.py`, `api/tests/test_pokemon_params.py`

**Interfaces:**
- Produces: constants `POKEMON_TYPES` (the 18, spec order), `SORT_KEYS = ("id", "total", "speed")`, `PAGE_SIZE = 20`,
  `MAX_LIMIT = 100`, `MAX_SEARCH_LENGTH = 100`; frozen dataclass `PokemonQuery(limit: int, page: int, search: str,
  sort: str, type: str | None)`; `parse_pokemon_query(params: Mapping[str, list[str]]) -> PokemonQuery | str` (a
  `str` is the error message). Takes every value per key so repeats are visible; the route passes
  `{k: request.query_params.getlist(k) for k in request.query_params}`.

Messages, verbatim from `query.ts`: `page must be a positive integer`, `limit must be an integer from 1 to 100`,
`search must be a single string`, `search must be at most 100 characters`, `sort must be one of id, total, speed`,
`type must be a known type`. Repeated `page`, `limit`, `sort` or `type`: the same message as an invalid value
(Express sees an array and fails its string check).

- [ ] **Step 1: Write the failing tests** — port every case in `server/query.test.ts` `describe('parsePokemonQuery')`
  (defaults; the nine rejects via `pytest.mark.parametrize`; search at the cap; canonical type case and trimmed
  search), plus:

```python
def test_repeated_search_is_rejected():
    assert parse_pokemon_query({"search": ["a", "b"]}) == "search must be a single string"

def test_repeated_page_is_rejected():
    assert parse_pokemon_query({"page": ["1", "2"]}) == "page must be a positive integer"

def test_empty_values_mean_defaults():
    assert parse_pokemon_query({"page": [""], "type": [""]}) == PokemonQuery(20, 1, "", "id", None)
```
- [ ] **Step 2: Run, verify FAIL** (module missing).
- [ ] **Step 3: Implement** `parse_pokemon_query`.
- [ ] **Step 4: Verify** — `uv run pytest -q`, ruff, mypy.
- [ ] **Step 5: Commit** — `"Parse pokemon query parameters like the Express API"`

---

### Task 4: The routes

**Files:**
- Create: `api/app/pokemon/queries.py`, `api/app/routes/pokemon.py`, `api/tests/test_pokemon_routes.py`
- Modify: `api/app/main.py` (include router), `api/tests/conftest.py` (`client` runs migrations: `run_migrations=True`)

**Interfaces:**
- Consumes: `PokemonQuery`, `parse_pokemon_query` (Task 3); `get_conn` (slice 0).
- Produces: `async def find_page(conn, query: PokemonQuery) -> dict` returning the response body;
  `async def find_by_id(conn, pokemon_id: int) -> dict | None`. Routes: `GET /api/pokemon` → 200 body or 400
  `{"error": message}`; `GET /api/pokemon/{pokemon_id}` (int path param) → 200 record or 404
  `{"error": "No creature #<id>"}`.

SQL: one `WHERE` shared by the page query and a `SELECT count(*)`:
`(%(type)s::text IS NULL OR %(type)s = ANY(types)) AND (%(pattern)s::text IS NULL OR lower(name) LIKE %(pattern)s OR
lower(description) LIKE %(pattern)s OR EXISTS (SELECT 1 FROM unnest(types) t WHERE lower(t) LIKE %(pattern)s))`,
where `pattern` is `'%' || escaped(lower(search)) || '%'`, or NULL for an empty search; `escaped` puts `\` before `\`, `%` and `_`
(`\` is `LIKE`'s default escape). `ORDER BY` from a fixed dict: `id` → `id`, `total` → `total_stats DESC, id`,
`speed` → `speed DESC, id` (a dict lookup, never user text in SQL). `LIMIT %(limit)s OFFSET %(offset)s`. Rows map to
camelCase; omit `isLegendary` when NULL. `totalPages = ceil(total / limit)`, `hasNext = page < totalPages`,
`hasPrev = page > 1`.

- [ ] **Step 1: Write the failing tests**

```python
@pytest.mark.parametrize("case", GOLDEN, ids=case_id)
def test_matches_express(client, case):
    response = client.get("/api/pokemon", params=case["query"])
    assert response.status_code == case["status"]
    assert response.json() == case["body"]

def test_backslash_is_literal(client):
    assert client.get("/api/pokemon", params={"search": "\\"}).json()["pagination"]["total"] == 0

def test_repeated_search_is_400(client):
    response = client.get("/api/pokemon?search=a&search=b")
    assert response.status_code == 400
    assert response.json() == {"error": "search must be a single string"}

def test_one_by_id(client):
    assert client.get("/api/pokemon/1").json() == POKEMON[0]

def test_unknown_id_is_404(client):
    response = client.get("/api/pokemon/5000")
    assert response.status_code == 404
    assert response.json() == {"error": "No creature #5000"}

def test_non_numeric_id_is_400(client):  # FastAPI's default is 422; keep the API's {"error"} shape
    assert client.get("/api/pokemon/abc").status_code == 400
```
For the last test add one exception handler in `main.py` for `RequestValidationError` → 400 `{"error": "<first
error's message>"}`.

- [ ] **Step 2: Run, verify FAIL** (404 from FastAPI on unknown route).
- [ ] **Step 3: Implement** `queries.py`, the router, the handler.
- [ ] **Step 4: Verify** — `uv run pytest -q` (all golden cases pass), ruff, mypy. Check the plan uses the indexes:
  `EXPLAIN SELECT … WHERE lower(name) LIKE '%fire%'` on the dev database shows `Bitmap Index Scan` on the trigram
  index or a seq scan. Either is fine at 1,000 rows; write down which one in the walkthrough notes.
- [ ] **Step 5: Commit** — `"Serve /api/pokemon and /api/pokemon/{id} from Postgres"`

---

### Task 5: CORS

**Files:**
- Modify: `api/app/config.py` (`cors_origin_regex: str | None = None`, env `CORS_ORIGIN_REGEX`), `api/app/main.py`
- Create: `api/tests/test_cors.py`

`CORSMiddleware(allow_origin_regex=settings.cors_origin_regex, allow_methods=["GET", "POST", "PUT", "DELETE"],
allow_headers=["Authorization", "Content-Type", "Idempotency-Key"])`, only when the regex is set. Starlette matches the
whole origin with `fullmatch`; the prod value is still written with `^…$`.

- [ ] **Step 1: Write the failing tests** with `CORS_REGEX = r"^https://pokemon-explorer(-pr-\d+)?-ogxllptvoa-uc\.a\.run\.app$"`:

```python
@pytest.mark.parametrize("origin", [
    "https://pokemon-explorer-ogxllptvoa-uc.a.run.app",
    "https://pokemon-explorer-pr-24-ogxllptvoa-uc.a.run.app"])
def test_allowed_origin_gets_header(cors_client, origin):
    r = cors_client.get("/api/health", headers={"Origin": origin})
    assert r.headers["access-control-allow-origin"] == origin

@pytest.mark.parametrize("origin", [
    "https://evil.com",
    "https://pokemon-explorer-ogxllptvoa-uc.a.run.app.evil.com",
    "http://pokemon-explorer-ogxllptvoa-uc.a.run.app"])
def test_other_origins_get_no_header(cors_client, origin):
    r = cors_client.get("/api/health", headers={"Origin": origin})
    assert "access-control-allow-origin" not in r.headers
```
- [ ] **Step 2: Run, verify FAIL.**  **Step 3: Implement.**  **Step 4: Verify** (pytest, ruff, mypy).
- [ ] **Step 5: Commit** — `"Allow the frontend's origins to call the API"`

---

### Task 6: Frontend calls the new API

**Files:**
- Modify: `src/lib/api.ts`, `src/lib/api.test.ts`, `src/test/fake-api.ts`, `src/vite-env.d.ts`, `vite.config.ts`,
  `package.json`, `Dockerfile`, `AGENTS.md` (dev instructions)

**Interfaces:**
- Produces: `API_BASE` in `src/lib/api.ts` = `import.meta.env.VITE_API_URL ?? ''`, used by `fetchPokemonPage` and
  `fetchPokemonById`. `fetchPokemonById(id)` calls `${API_BASE}/api/pokemon/${id}`; 404 → `CreatureNotFoundError`.
  `fetchRandomPokemon` is unchanged (still pages by position).

- [ ] **Step 1: Write the failing test** in `src/lib/api.test.ts`: `fetchPokemonById(7)` requests a URL whose path is
  `/api/pokemon/7`, and a 404 response rejects with `CreatureNotFoundError`. Update `fake-api.ts` so
  `apiResponse` serves `/api/pokemon/<id>` (200 record or 404 `{"error": "No creature #<id>"}`) and keeps the list
  behavior for `/api/pokemon`.
- [ ] **Step 2: Run, verify FAIL** — `pnpm vitest run src/lib/api.test.ts`.
- [ ] **Step 3: Implement** `API_BASE` and the new `fetchPokemonById`; type `VITE_API_URL` in `vite-env.d.ts`.
- [ ] **Step 4: Dev wiring.** `vite.config.ts`: the Express middleware calls `next()` for paths starting with
  `/api/pokemon` (so they fall through), and `server.proxy` sends `/api/pokemon` to `http://localhost:8000`.
  `package.json`: `"dev:api": "cd api && DATABASE_URL=postgresql://postgres:postgres@localhost:54329/pokemon
  JWT_SECRET=dev uv run uvicorn app.asgi:app --reload --port 8000"`. `Dockerfile` (root): `ARG VITE_API_URL` before
  `pnpm build`, passed as `ENV`. `AGENTS.md`: dev now needs `docker compose up -d --wait db`, `pnpm dev:api` and
  `pnpm dev` in two terminals.
- [ ] **Step 5: Verify** — `pnpm lint && pnpm test && pnpm build` green. Manual: with both dev servers running, the
  Explorer at `localhost:5173` loads, searches `fire`, scrolls to page 2, and the FastAPI terminal logs the requests.
- [ ] **Step 6: Commit** — `"Point the Explorer at the FastAPI service"`

---

### Task 7: Deploy wiring

**Files:**
- Modify: `infra/index.ts`, `.github/workflows/deploy.yml`

- In `deployApi()`: add env `CORS_ORIGIN_REGEX` = `^https://pokemon-explorer(-pr-\d+)?-${CLOUD_RUN_HASH}-uc\.a\.run\.app$`,
  where `CLOUD_RUN_HASH = 'ogxllptvoa'` is a constant with a one-line comment: Cloud Run's URL hash, fixed per project
  and region (seen in both live URLs). A constant, because reading it from the Express service's URI would make the
  API depend on the frontend's deploy.
- Express image: `buildArgs: { VITE_API_URL: <api url> }`. Prod: the `api-service` output. PR stacks:
  `gcp.cloudrunv2.getServiceOutput({ location: region, name: 'pokemon-api' }).uri` (previews call the prod API, which is
  read-only for this slice).
- Smoke test, after the API health step: `curl "$API_URL/api/pokemon?search=fire&limit=50"` passes the same `jq`
  filter as the Express search check, and `curl -H "Origin: $URL" -sD - "$API_URL/api/health" -o /dev/null`
  contains `access-control-allow-origin: $URL`.

- [ ] **Step 1: Typecheck** — `cd infra && pnpm types` clean.
- [ ] **Step 2: Push, open the PR.** Expected: `check`, `check-api` green; the Pulumi preview comment shows the API
  service updated (env) and the Express image and service updated (build arg); no replace or delete. The PR preview
  URL's Explorer loads data from the prod API (Network tab shows `pokemon-api-…/api/pokemon`).
- [ ] **Step 3: Commit** — `"Build the frontend against the API and smoke-test it"`

---

### Task 8: Docs and walkthrough

- [ ] **Decisions** (`docs/backend/decisions.md`, template): seed as a generated migration (rejected: a startup seed
  step; copying the JSON into the image); golden-file parity with Express (rejected: hand-porting the tests only);
  `LIKE` with escaping plus trigram indexes (rejected: `ILIKE` without escaping; full-text search, which matches
  words, not substrings); dev and test databases split; two `/api/pokemon` implementations until slice 8.
- [ ] **Interview questions** (`product/interview-questions.md`, 🔴): why `%` must be escaped and what happens if it
  isn't; what a trigram index is; why the seed is a migration; how the golden file proves parity; what CORS is and why
  same-origin dev needs none; why sorts break ties by id; why `OFFSET` gets slow and what keyset pagination is.
- [ ] **Commit** — `"Document slice 1 decisions"`
- [ ] **Owner merges; Claude watches the deploy** and checks the live Explorer requests `pokemon-api-…`.
- [ ] **Walkthrough (owner):** trace `GET /api/pokemon?page=2&limit=20&search=fire` through the new code, as on day
  one with Express: route → parse → SQL (both queries) → response. Claude corrects and adds the notebook shorthand.
