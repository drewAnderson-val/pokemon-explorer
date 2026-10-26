# API slice 0: skeleton, deployed — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A FastAPI service in `api/` that connects to Postgres, runs SQL migrations, answers `GET /api/health`, is
checked in CI and runs live on its own Cloud Run service against Supabase. Nothing user-visible. The Vite proxy the
spec lists under slice 0 moves to slice 1, the first slice with an endpoint for it to forward.

**Architecture:** An app factory (`create_app`) builds the FastAPI app with an async `psycopg` connection pool opened
in the lifespan. On startup, a migration runner applies numbered `.sql` files under a Postgres advisory lock. The
existing Express container is untouched; the API is a second image and a second Cloud Run service in the `prod`
Pulumi stack, with its database URL and JWT secret from Secret Manager.

**Tech Stack:** Python 3.13, uv, FastAPI, uvicorn, psycopg 3 (async) + psycopg_pool, pytest, ruff, mypy (strict),
Postgres 17 (docker compose locally, Supabase in prod), Pulumi (TypeScript), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-26-fastapi-backend-design.md` (slice 0). Reasons for every decision:
`docs/backend/decisions.md`.

## Global Constraints

- The owner must be able to explain every line: plain, explicit code; no ORM; one short comment where the *why*
  isn't obvious, none otherwise.
- Postgres via `psycopg` 3 with hand-written SQL. Migrations are numbered `.sql` files applied in order.
- Every table in the `public` schema has row-level security enabled (Supabase exposes `public` through its Data API).
- Secrets (database URL, JWT secret) never appear in the repo, Pulumi config or CI logs.
- `main` deploys to prod on every push; Express keeps serving the React build and every existing endpoint.
- Health route is `/api/health` (Cloud Run reserves paths ending in `z`).
- `infra/` rules apply (`infra/AGENTS.md`): CI never runs the bootstrap stack; only `prod` creates shared resources.
- Commits end with the attribution lines from the session's system reminder.

## Review Focus

1. **Tests pointed at a real database.** The test fixture drops and recreates the `public` schema. If
   `TEST_DATABASE_URL` points anywhere but localhost, it must refuse to run rather than wipe it. (Task 2 test.)
2. **Two instances starting at once.** Cloud Run can start two revisions or instances together; both run migrations.
   Each migration must apply exactly once. (Task 3 test: two concurrent runners.)
3. **A table created without RLS.** A future migration that forgets `ENABLE ROW LEVEL SECURITY` must fail the test
   suite, not reach Supabase. (Task 3 test over all `public` tables.)
4. **Database down.** `/api/health` must answer 503 quickly (within its probe timeout), not hang. (Task 2 test.)
5. **A broken migration.** A migration that errors must leave nothing half-applied and must not be recorded as done.
   (Task 3 test.)

## Files

| Path | Responsibility |
| --- | --- |
| `api/pyproject.toml`, `api/uv.lock`, `api/.python-version` | Project, dependencies, tool config (ruff, mypy, pytest) |
| `api/app/main.py` | `create_app(settings)`: lifespan (pool, migrations), routers |
| `api/app/config.py` | `Settings` read from environment variables |
| `api/app/db/pool.py` | Opening the pool; the `get_conn` dependency |
| `api/app/db/migrate.py` | Migration runner (`python -m app.db.migrate` also runs it) |
| `api/app/db/migrations/` | `NNNN_name.sql` files |
| `api/app/routes/health.py` | `GET /api/health` |
| `api/tests/conftest.py` | Test database guard, reset, app and client fixtures |
| `api/tests/test_*.py` | Tests |
| `api/Dockerfile`, `api/.dockerignore` | API image |
| `docker-compose.yml` | Local Postgres 17 on port 54329 |
| `.dockerignore` (root) | Exclude `api` from the Express image |
| `.github/workflows/deploy.yml` | `check-api` job; deploy waits for it; API smoke test |
| `infra/bootstrap/index.ts` | Secret Manager API, the two secrets, accessor grants for the API runtime account |
| `infra/index.ts` | API image, runtime account and Cloud Run service (prod only); `apiUrl` output |

---

### Task 1: Project skeleton and health route

**Files:**
- Create: `api/pyproject.toml`, `api/.python-version` (`3.13`), `api/app/__init__.py`, `api/app/config.py`,
  `api/app/main.py`, `api/app/routes/__init__.py`, `api/app/routes/health.py`, `api/tests/test_health.py`
- Modify: `.gitignore` (add `.venv/`, `__pycache__/`, `.pytest_cache/`, `.mypy_cache/`, `.ruff_cache/`)

**Interfaces:**
- Produces: `Settings` (frozen dataclass: `database_url: str`, `jwt_secret: str`, `run_migrations: bool = True`),
  `Settings.from_env() -> Settings` (reads `DATABASE_URL`, `JWT_SECRET`, `RUN_MIGRATIONS`; raises `RuntimeError`
  naming the missing variable), `create_app(settings: Settings) -> FastAPI`, module-level
  `app = create_app(Settings.from_env())` guarded so importing `create_app` alone needs no env vars (put the
  module-level app in `api/app/asgi.py`, which uvicorn runs as `app.asgi:app`).

- [ ] **Step 1: Create the project**

```bash
cd api && uv init --app --no-workspace --name pokemon-api --python 3.13 .
uv add fastapi uvicorn[standard] "psycopg[binary]" psycopg-pool
uv add --dev pytest httpx ruff mypy
```
Delete any `main.py`/`hello.py` uv generated. In `pyproject.toml` configure: ruff (line length 100, rules
`E,F,I,B,UP,SIM`), mypy `strict = true` over `app` and `tests`, pytest `testpaths = ["tests"]`.

- [ ] **Step 2: Write the failing test** in `api/tests/test_health.py` (no database yet)

```python
def test_health_reports_ok(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```
With a temporary `client` fixture in the test file: `TestClient(create_app(Settings("unused", "unused", run_migrations=False)))`.
Task 2 replaces it with the shared fixture.

- [ ] **Step 3: Run it to verify it fails**

Run: `cd api && uv run pytest -v` — Expected: FAIL (import error, `app.main` missing).

- [ ] **Step 4: Implement** `Settings`, `create_app`, and `health.router` (`APIRouter`, `GET /api/health` returning
  `{"status": "ok"}`), plus `app/asgi.py`.

- [ ] **Step 5: Verify**

Run: `cd api && uv run pytest -v && uv run ruff check . && uv run ruff format --check . && uv run mypy`
Expected: 1 passed; ruff and mypy clean.

- [ ] **Step 6: Commit** — `git add api .gitignore && git commit -m "Add the FastAPI project with a health route"`

---

### Task 2: Postgres locally, the connection pool, a health check that touches the database

**Files:**
- Create: `docker-compose.yml`, `api/app/db/__init__.py`, `api/app/db/pool.py`, `api/tests/conftest.py`
- Modify: `api/app/main.py` (lifespan), `api/app/routes/health.py`, `api/tests/test_health.py`

**Interfaces:**
- Consumes: `Settings`, `create_app` (Task 1).
- Produces: `open_pool(database_url: str) -> AsyncConnectionPool` (min 1, max 10, `open=False`; opened with
  `await pool.open(wait=False)` so startup doesn't block on the database), stored on `app.state.pool`;
  `get_conn(request: Request) -> AsyncIterator[AsyncConnection]` FastAPI dependency (`async with pool.connection()`);
  fixtures `test_database_url` (session), `reset_db` (drops and recreates `public`), `client` (a `TestClient` used as
  a context manager so the lifespan runs).

`docker-compose.yml`: one service `db`, image `postgres:17`, `POSTGRES_PASSWORD=postgres`, port `54329:5432`, a
healthcheck with `pg_isready`. Default `TEST_DATABASE_URL`: `postgresql://postgres:postgres@localhost:54329/postgres`.

- [ ] **Step 1: Write the failing tests** in `api/tests/test_health.py` and `api/tests/test_conftest_guard.py`

```python
def test_health_reports_ok_when_database_answers(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

def test_health_is_503_when_database_is_down():
    app = create_app(Settings("postgresql://postgres:x@localhost:1/none", "unused", run_migrations=False))
    with TestClient(app) as client:
        started = time.monotonic()
        response = client.get("/api/health")
    assert response.status_code == 503
    assert response.json() == {"status": "database unavailable"}
    assert time.monotonic() - started < 3

def test_guard_refuses_non_local_database():
    with pytest.raises(RuntimeError, match="localhost"):
        assert_local("postgresql://u:p@db.supabase.co:5432/postgres")
```
`assert_local(url: str) -> None` lives in `conftest.py` and allows only hosts `localhost` and `127.0.0.1`.

- [ ] **Step 2: Run to verify they fail** — `docker compose up -d db && cd api && uv run pytest -v` — Expected: FAIL.

- [ ] **Step 3: Implement** the pool, the lifespan (open pool on start, close on shutdown), the dependency, and the
  health route: `SELECT 1` with a 2-second connection timeout; on any `psycopg` or pool error return 503
  `{"status": "database unavailable"}`. Conftest: `assert_local` on `TEST_DATABASE_URL` before any reset.

- [ ] **Step 4: Verify** — `cd api && uv run pytest -v && uv run ruff check . && uv run mypy` — Expected: all pass.

- [ ] **Step 5: Commit** — `git commit -m "Connect the API to Postgres; health checks the database"`

---

### Task 3: Migration runner

**Files:**
- Create: `api/app/db/migrate.py`, `api/app/db/migrations/0001_schema_migrations_rls.sql`, `api/tests/test_migrate.py`,
  `api/tests/test_rls.py`
- Modify: `api/app/main.py` (run migrations in the lifespan when `settings.run_migrations`)

**Interfaces:**
- Consumes: `open_pool`, fixtures from Task 2.
- Produces: `async def migrate(conn: AsyncConnection, directory: Path = MIGRATIONS_DIR) -> list[str]` returning the
  names applied this run; `python -m app.db.migrate` runs it against `DATABASE_URL`.

Behavior:
1. `pg_advisory_lock(<fixed bigint constant, named MIGRATION_LOCK_ID>)` on the connection; released in `finally`.
2. `CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`.
3. For each `NNNN_*.sql` in name order not in `schema_migrations`: in one transaction, execute the file and insert its
   name. An error rolls the transaction back and re-raises (the app then fails to start; Cloud Run keeps the old
   revision).

`0001_schema_migrations_rls.sql`: `ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;`

- [ ] **Step 1: Write the failing tests**

```python
async def test_applies_in_order_and_records(tmp_path, conn):  # conn: fresh connection after reset_db
    write(tmp_path, "0002_b.sql", "INSERT INTO t VALUES (2);")
    write(tmp_path, "0001_a.sql", "CREATE TABLE t (n int);")
    assert await migrate(conn, tmp_path) == ["0001_a.sql", "0002_b.sql"]
    assert await rows(conn, "SELECT n FROM t") == [(2,)]

async def test_second_run_applies_nothing(tmp_path, conn): ...  # migrate twice → second returns []

async def test_failed_migration_leaves_nothing(tmp_path, conn):
    write(tmp_path, "0001_bad.sql", "CREATE TABLE t (n int); SELECT * FROM missing;")
    with pytest.raises(psycopg.errors.UndefinedTable):
        await migrate(conn, tmp_path)
    assert await rows(conn, "SELECT to_regclass('t')") == [(None,)]
    assert await rows(conn, "SELECT name FROM schema_migrations") == []

async def test_concurrent_runners_apply_once(tmp_path, test_database_url):
    write(tmp_path, "0001_a.sql", "CREATE TABLE t (n int); SELECT pg_sleep(0.5); INSERT INTO t VALUES (1);")
    a, b = await asyncio.gather(run_on_new_connection(tmp_path), run_on_new_connection(tmp_path))
    assert sorted([a, b]) == [[], ["0001_a.sql"]]
```
`test_rls.py`, run after real migrations:
```python
async def test_every_public_table_has_rls(migrated_conn):
    missing = await rows(migrated_conn,
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity")
    assert missing == []
```
Mark async tests with `pytest-asyncio` (`uv add --dev pytest-asyncio`, `asyncio_mode = "auto"`).

- [ ] **Step 2: Run to verify they fail** — `cd api && uv run pytest -v` — Expected: FAIL (`migrate` missing).

- [ ] **Step 3: Implement** `migrate`, the `__main__` entry, the `0001` file and the lifespan call (one connection
  from the pool, before the app starts serving).

- [ ] **Step 4: Verify** — `cd api && uv run pytest -v && uv run ruff check . && uv run mypy` — all pass. Then
  `uv run python -m app.db.migrate` against compose twice: first prints `0001_schema_migrations_rls.sql`, second
  prints nothing.

- [ ] **Step 5: Commit** — `git commit -m "Run numbered SQL migrations under an advisory lock"`

---

### Task 4: Image and CI

**Files:**
- Create: `api/Dockerfile`, `api/.dockerignore` (`.venv`, `__pycache__`, `.pytest_cache`, `.mypy_cache`,
  `.ruff_cache`, `tests`)
- Modify: `.dockerignore` (root: add `api`, `docker-compose.yml`), `.github/workflows/deploy.yml`

Dockerfile: `python:3.13-slim`; copy `uv` from `ghcr.io/astral-sh/uv` (pin a tag); `uv sync --frozen --no-dev`;
copy `app/`; run as a non-root user; `CMD` uvicorn `app.asgi:app` on `0.0.0.0:${PORT:-8080}`.

CI: a `check-api` job beside `check`: Postgres 17 service container on 5432 with health options; `astral-sh/setup-uv`
(pinned major); in `api/`: `uv sync --frozen`, `uv run ruff check .`, `uv run ruff format --check .`,
`uv run mypy`, `uv run pytest` with `TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres`.
`deploy` and `preview-env` get `needs: [check, check-api]`.

- [ ] **Step 1: Build and run the image locally**

```bash
docker build -t pokemon-api api
docker run --rm -p 8080:8080 --add-host=host.docker.internal:host-gateway \
  -e DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:54329/postgres -e JWT_SECRET=dev pokemon-api
curl -fsS localhost:8080/api/health
```
Expected: `{"status":"ok"}`; container logs show the migration applied (or none pending).

- [ ] **Step 2: Check the Express image is unchanged** — `docker build -t pokemon-explorer . && pnpm build` succeed
  and `docker run --rm pokemon-explorer ls /app` shows no `api`.

- [ ] **Step 3: Commit and push the branch; open a draft PR** — Expected: `check` and `check-api` both green. If
  `check-api` fails, paste its output to the owner.

---

### Task 5: Supabase and secrets (owner-run steps, with Claude preparing the code)

**Files:**
- Modify: `infra/bootstrap/index.ts`

Bootstrap changes: add `secretmanager.googleapis.com` to `apis`; create `gcp.secretmanager.Secret`s `api-database-url`
and `api-jwt-secret` (automatic replication, no versions in code); grant
`roles/secretmanager.secretAccessor` on each to `serviceAccount:pokemon-api-run@${project}.iam.gserviceaccount.com`
(created by the app stack in Task 6, same pattern as `runtime-aiplatform-user`).

- [ ] **Step 1: Typecheck** — `cd infra && pnpm install && pnpm types` — Expected: clean.

- [ ] **Step 2 (owner): Create the Supabase project.** Free tier, region `us-east-1` or nearest to `us-central1`.
  Claude may do this with the Supabase connector only after the owner confirms. Then in Supabase settings, turn the
  Data API off (RLS stays on as the second lock).

- [ ] **Step 3 (owner): Preview, then apply the bootstrap stack** —
  `cd infra/bootstrap && PULUMI_CONFIG_PASSPHRASE= pulumi preview --stack prod --diff`, then `pulumi up --stack prod`.
  Expected: 1 API enabled, 2 secrets, 2 IAM members; nothing replaced or deleted.

- [ ] **Step 4 (owner): Add secret values** without them touching the shell history or the repo:
  the **session pooler** connection string (port 5432 on the `pooler.supabase.com` host; Cloud Run has no IPv6 egress
  for Supabase's direct host, and session mode keeps `LISTEN/NOTIFY` working) via
  `gcloud secrets versions add api-database-url --data-file=-` (paste, then Ctrl-D), and a JWT secret via
  `openssl rand -base64 48 | gcloud secrets versions add api-jwt-secret --data-file=-`.

- [ ] **Step 5: Commit** — `git commit -m "Add Secret Manager secrets for the API"`

---

### Task 6: Deploy the API service

**Files:**
- Modify: `infra/index.ts`, `.github/workflows/deploy.yml` (smoke test)

**Interfaces:**
- Consumes: secrets `api-database-url`, `api-jwt-secret` (Task 5); image from `api/Dockerfile` (Task 4).
- Produces: Pulumi output `apiUrl`, exposed by the `deploy` job as `outputs.api-url`.

Inside `if (isProd)`: runtime service account `pokemon-api-run`; a second `dockerBuild.Image` with context `../api`,
tag `${registryHost}/${project}/${appName}/api:latest`; `gcp.cloudrunv2.Service` `pokemon-api` with
`DATABASE_URL` and `JWT_SECRET` from `valueSource.secretKeyRef` (`version: 'latest'`), the same startup probe on
`/api/health`, `scaling: { minInstanceCount: 0, maxInstanceCount: 2 }`, `cpuIdle: true`, 512Mi; public invoker
binding. PR stacks don't get an API (they would share the prod database); recorded in decisions.

- [ ] **Step 1: Typecheck and preview** — `cd infra && pnpm types && PULUMI_CONFIG_PASSPHRASE= pulumi preview --stack prod --diff`
  Expected: creates the account, image, service and IAM binding; the existing `service` shows no replace.

- [ ] **Step 2: Add the smoke test** — in `smoke-test`, `curl -fsS --retry 5 --retry-all-errors --retry-delay 3 "$API_URL/api/health"`
  and assert `.status == "ok"` with `jq -e`.

- [ ] **Step 3: Commit, push, mark the PR ready** — Expected: PR checks green, Pulumi preview comment shows only
  additions.

- [ ] **Step 4 (owner): Merge.** Expected: deploy and smoke test green; `curl <apiUrl>/api/health` returns
  `{"status":"ok"}`; Supabase shows `schema_migrations` with one row. If the deploy fails, paste the job output.

---

### Task 7: Docs and walkthrough

**Files:**
- Modify: `docs/backend/decisions.md`, `AGENTS.md` (Layout row for `api/`, `docker-compose.yml`; API commands under
  "Verify before you say it works"), `docs/superpowers/specs/2026-10-26-fastapi-backend-design.md` (session pooler
  instead of "direct connection"; PR previews have no API)
- Modify (private): `product/interview-questions.md`

- [ ] **Step 1: Decision entries**, one each in the log's template: async `psycopg` (SSE and `LISTEN` later need
  async); migrations on startup under an advisory lock (rejected: a CI step that would need the database secret in
  GitHub); health checks the database (rejected: a static 200 that hides a broken connection; trade-off: a database
  outage fails the startup probe of new revisions); no API in PR previews yet (rejected: sharing the prod database;
  Supabase branching costs money); session pooler URL.

- [ ] **Step 2: Interview questions** (🔴): what an advisory lock is and why migrations need one; why a migration
  runs in one transaction; why RLS is on with no policies; what `cpuIdle` and scale-to-zero mean for a sweeper later.

- [ ] **Step 3: Commit** — `git commit -m "Document slice 0 decisions"`

- [ ] **Step 4 (owner): Walkthrough.** The owner explains, in their own words, what happens from `uvicorn` starting
  to `/api/health` answering: settings, lifespan, pool, migrations under the lock, the route. Claude corrects and adds
  a notebook shorthand. Slice 1 starts only after this.
