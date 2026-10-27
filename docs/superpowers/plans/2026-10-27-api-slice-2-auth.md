# API slice 2: accounts and sign-in — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** People can create an account and sign in; the API issues a 1-hour JWT and has one `current_user` dependency
that every later protected route uses; the frontend has a sign-in screen and keeps the token.

**Architecture:** A `users` table (migration). `app/auth/passwords.py` hashes with argon2id; `app/auth/tokens.py`
signs and verifies HS256 JWTs with PyJWT; `app/auth/deps.py` turns an `Authorization: Bearer` header into a user or a
401. Routes: signup, login, me. The frontend stores the token with the existing `createLocalStore`, sends it through
one `authFetch` helper, and adds a `/login` screen.

**Tech Stack:** FastAPI, psycopg 3, `argon2-cffi`, `PyJWT`; React; Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-26-fastapi-backend-design.md` (Auth; API rows `signup`, `login`, `me`;
Slices: 2). Decisions: `docs/backend/decisions.md` ("Auth stays small").

## Global Constraints

- One access token, **1-hour expiry**, HS256, claims `sub` (user id as a string), `iat`, `exp`. No refresh tokens.
- Password hashes are argon2id; the password itself is never stored or logged.
- Login answers unknown username and wrong password with the **same** 401 body.
- Errors are `{"error": "<message for people>"}` with 400 / 401 / 409, like every other route.
- The token lives in `localStorage` (trade-off already in the decisions log). Logout forgets it on the client.
- No screen is gated behind sign-in yet: teams and battles still run in the browser until slice 4, which adds the
  gating together with the server routes that need it.
- New API dependencies: `argon2-cffi`, `pyjwt`. Nothing else.

## Review Focus

1. **Timing tells which usernames exist.** If login skips hashing for an unknown username, it answers measurably
   faster. Login must run one argon2 verify either way. (Task 4 test.)
2. **A token signed with `alg: none` or another algorithm.** Decoding must pin `algorithms=["HS256"]` and require `exp`
   and `sub`. (Task 2 tests.)
3. **Hashing blocks the server.** argon2 takes tens of milliseconds of CPU; in an `async` route it would stall every
   other request on the instance. Hash and verify run in the thread pool. (Task 4: a test that two logins overlap.)
4. **Memory per hash.** argon2-cffi's default uses 64 MiB per hash; a burst of logins on a 512 MiB instance could run
   out of memory. Use 19 MiB, 2 iterations, 1 lane (OWASP's recommended minimum). (Task 1 test on the hash's
   parameters.)
5. **Open redirect after sign-in.** `/login?next=https://evil.com` or `next=//evil.com` must not send the user
   off-site. Only paths starting with a single `/` are followed. (Task 6 test.)

## Files

| Path | Responsibility |
| --- | --- |
| `api/app/db/migrations/0003_users.sql` | `users` table |
| `api/app/auth/passwords.py` | `hash_password`, `verify_password` (argon2id, fixed parameters) |
| `api/app/auth/tokens.py` | `issue_token`, `read_token` (PyJWT) |
| `api/app/auth/deps.py` | `current_user` dependency, `CurrentUser` type |
| `api/app/auth/users.py` | SQL: create user, find by username, find by id |
| `api/app/routes/auth.py` | `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/me` |
| `src/lib/auth.ts` | Token store, `signup`, `login`, `logout`, `authFetch` |
| `src/hooks/useAuth.ts` | The signed-in user for React |
| `src/screens/LoginScreen.tsx` | `/login`: sign in or create an account |
| `src/App.tsx`, `src/screens/LandingScreen.tsx` | Route; "Sign in" / "Signed in as …" |
| `vite.config.ts` | Proxy `/api/auth` and `/api/me` too |

---

### Task 1: Users table and password hashing

**Files:**
- Create: `api/app/db/migrations/0003_users.sql`, `api/app/auth/__init__.py`, `api/app/auth/passwords.py`,
  `api/tests/test_passwords.py`
- Modify: `api/pyproject.toml` (`uv add argon2-cffi pyjwt`), `api/tests/test_health.py` (startup expects three
  migrations)

**Interfaces:**
- Produces: table `users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), username text NOT NULL, password_hash text
  NOT NULL, created_at timestamptz NOT NULL DEFAULT now())` with `CREATE UNIQUE INDEX users_username_lower ON users
  (lower(username))` (so `Drew` and `drew` can't both exist). `hash_password(password: str) -> str`,
  `verify_password(password_hash: str, password: str) -> bool` (False on mismatch, never raises for a wrong password),
  `DUMMY_HASH: str` (a hash computed once at import, used to spend the same time on unknown usernames). Hasher:
  `argon2.PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1)`.

- [ ] **Step 1: Write the failing tests**

```python
def test_hash_is_not_the_password_and_verifies():
    h = hash_password("correct horse")
    assert "correct horse" not in h
    assert verify_password(h, "correct horse") is True
    assert verify_password(h, "wrong horse") is False

def test_same_password_hashes_differently():  # random salt per hash
    assert hash_password("pw12345678") != hash_password("pw12345678")

def test_uses_argon2id_with_fixed_parameters():
    assert hash_password("pw12345678").startswith("$argon2id$v=19$m=19456,t=2,p=1$")

async def test_usernames_are_unique_ignoring_case(conn): ...  # insert 'Drew', then 'drew' → UniqueViolation
```
- [ ] **Step 2: Run, verify FAIL** — `cd api && uv run pytest -q tests/test_passwords.py`.
- [ ] **Step 3: Implement** the migration and `passwords.py`.
- [ ] **Step 4: Verify** — `uv run pytest -q`, ruff, mypy.
- [ ] **Step 5: Commit** — `"Add the users table and argon2id password hashing"`

---

### Task 2: Tokens

**Files:**
- Create: `api/app/auth/tokens.py`, `api/tests/test_tokens.py`

**Interfaces:**
- Produces: `TOKEN_LIFETIME = timedelta(hours=1)`; `issue_token(user_id: UUID, secret: str, now: datetime | None =
  None) -> tuple[str, datetime]` returning the token and its expiry; `read_token(token: str, secret: str) -> UUID`
  raising `InvalidToken` (a module-level exception) for anything wrong. Decode with `algorithms=["HS256"]`,
  `options={"require": ["exp", "iat", "sub"]}`.

- [ ] **Step 1: Write the failing tests**

```python
def test_round_trip():
    user_id = uuid4()
    token, expires = issue_token(user_id, SECRET, now=NOW)
    assert expires == NOW + timedelta(hours=1)
    assert read_token(token, SECRET) == user_id

def test_expired_token_is_rejected():
    token, _ = issue_token(uuid4(), SECRET, now=datetime.now(UTC) - timedelta(hours=2))
    with pytest.raises(InvalidToken):
        read_token(token, SECRET)

def test_wrong_secret_is_rejected(): ...
def test_tampered_payload_is_rejected(): ...   # swap the middle segment for another token's
def test_alg_none_is_rejected():
    forged = jwt.encode({"sub": str(uuid4()), "iat": now_ts, "exp": now_ts + 60}, None, algorithm="none")
    with pytest.raises(InvalidToken):
        read_token(forged, SECRET)
def test_missing_sub_is_rejected(): ...
def test_garbage_is_rejected(): ...           # "not.a.token", ""
```
- [ ] **Step 2: Run, verify FAIL.**  **Step 3: Implement.**  **Step 4: Verify** (pytest, ruff, mypy).
- [ ] **Step 5: Commit** — `"Issue and verify 1-hour HS256 tokens"`

---

### Task 3: `current_user`

**Files:**
- Create: `api/app/auth/users.py`, `api/app/auth/deps.py`, `api/tests/test_current_user.py`

**Interfaces:**
- Consumes: `read_token`, `InvalidToken` (Task 2); `get_conn`.
- Produces: `@dataclass(frozen=True) User(id: UUID, username: str)`; in `users.py`: `create_user(conn, username: str,
  password_hash: str) -> User` (raises `UsernameTaken` on the unique violation), `find_login(conn, username: str) ->
  tuple[User, str] | None` (user and hash, case-insensitive), `find_user(conn, user_id: UUID) -> User | None`.
  In `deps.py`: `async def current_user(request: Request, conn: Conn) -> User` raising `HTTPException(401,
  headers={"WWW-Authenticate": "Bearer"})` with detail `"Sign in to continue"`; `CurrentUser = Annotated[User,
  Depends(current_user)]`. An `HTTPException` handler in `main.py` renders `{"error": detail}` (keeping the headers).

Header parsing: exactly `Bearer <token>` (scheme case-insensitive, one space); anything else is 401. A valid token for
a user that no longer exists is 401.

- [ ] **Step 1: Write the failing tests** against a tiny test-only route mounted in the test (`GET /test/whoami`
  depending on `CurrentUser`): no header → 401 `{"error": "Sign in to continue"}` with `WWW-Authenticate: Bearer`;
  `Basic abc` → 401; valid token → 200 with the username; token for a deleted user → 401; expired token → 401.
- [ ] **Step 2: Run, verify FAIL.**  **Step 3: Implement.**  **Step 4: Verify.**
- [ ] **Step 5: Commit** — `"Add the current_user dependency"`

---

### Task 4: Signup, login, me

**Files:**
- Create: `api/app/routes/auth.py`, `api/tests/test_auth_routes.py`
- Modify: `api/app/main.py` (router)

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: `POST /api/auth/signup` body `{username, password}` → **201** `{"token", "expiresAt" (Unix seconds),
  "user": {"id", "username"}}`; `POST /api/auth/login` same body → **200** same shape; `GET /api/me` → `{"id",
  "username"}`. Pydantic body model `Credentials(username: str, password: str)`.

Rules: username 3–20 characters of `[A-Za-z0-9_]`; password 8–128 characters (the cap keeps a megabyte "password"
from costing a megabyte of hashing). Messages: `username must be 3-20 letters, digits or underscores`,
`password must be 8-128 characters`, `That username is taken` (409), `Wrong username or password` (401, both cases).
Hashing and verifying run in `starlette.concurrency.run_in_threadpool`. Login with an unknown username verifies
against `DUMMY_HASH`.

- [ ] **Step 1: Write the failing tests**

```python
def test_signup_then_me(client):
    r = client.post("/api/auth/signup", json={"username": "Drew_1", "password": "correct horse"})
    assert r.status_code == 201
    body = r.json()
    assert body["user"]["username"] == "Drew_1"
    assert body["expiresAt"] - time.time() == pytest.approx(3600, abs=5)
    me = client.get("/api/me", headers={"Authorization": f"Bearer {body['token']}"})
    assert me.json() == body["user"]

def test_signup_rejects_taken_username_ignoring_case(client): ...   # 'drew_1' after 'Drew_1' → 409
@pytest.mark.parametrize(...)  # 'ab', 'a'*21, 'has space', 'émile'; passwords 'short', 'x'*129 → 400 + message
def test_login_succeeds(client): ...
def test_wrong_password_and_unknown_user_get_the_same_answer(client):
    ...
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json() == {"error": "Wrong username or password"}

def test_unknown_user_still_runs_a_verify(client, monkeypatch):
    calls = count_calls(monkeypatch, "app.routes.auth.verify_password")
    client.post("/api/auth/login", json={"username": "nobody_here", "password": "whatever123"})
    assert calls == [DUMMY_HASH]

async def test_logins_do_not_block_each_other(...):  # two concurrent logins via httpx.AsyncClient + ASGITransport
    # finish in well under 2 × one login's time (hashing off the event loop)

def test_login_username_is_case_insensitive(client): ...   # signup 'Drew_1', login 'drew_1' → 200
def test_missing_fields_are_400(client): ...                 # {} → 400 {"error": ...}
def test_password_never_in_response_or_db(client, conn): ...  # response JSON and users row contain no plaintext
```
- [ ] **Step 2: Run, verify FAIL.**  **Step 3: Implement.**  **Step 4: Verify** — pytest, ruff, mypy; golden tests
  still pass.
- [ ] **Step 5: Commit** — `"Add signup, login and /api/me"`

---

### Task 5: Frontend token handling

**Files:**
- Create: `src/lib/auth.ts`, `src/lib/auth.test.ts`, `src/hooks/useAuth.ts`
- Modify: `vite.config.ts` (`FASTAPI_PREFIXES = ['/api/pokemon', '/api/auth', '/api/me']`, matched only when the
  path equals the prefix or continues with `/` or `?`), `src/test/fake-api.ts` (optional handlers for the auth
  routes, used by Task 6's tests)

**Interfaces:**
- Produces: `type Session = { expiresAt: number; token: string; user: { id: string; username: string } }`;
  `authStore` (`createLocalStore<Session | null>`, key `pokemon-explorer:session`); `currentSession(now = Date.now())
  -> Session | null` (null when missing or `expiresAt * 1000 <= now`); `signup(username, password): Promise<Session>`
  and `login(...)` (throw `Error` with the API's message on 4xx); `logout(): void`; `authFetch(path: string, init?:
  RequestInit): Promise<Response>` prefixes `API_BASE`, adds `Authorization: Bearer` when signed in, and clears the
  session on a 401. `useAuth(): Session | null`. Export `API_BASE` from `src/lib/api.ts`.

- [ ] **Step 1: Write the failing tests** (`auth.test.ts`, with `stubFetch` handlers): login stores the session and
  `authFetch('/api/me')` sends the bearer header; a 401 from `authFetch` clears the session; an expired session reads
  as null; `login` with a 401 throws `Wrong username or password`; `logout` clears it.
- [ ] **Step 2: Run, verify FAIL.**  **Step 3: Implement.**  **Step 4: Verify** — `pnpm lint && pnpm test`.
- [ ] **Step 5: Commit** — `"Keep the session token in the browser and send it with API calls"`

---

### Task 6: Sign-in screen

**Files:**
- Create: `src/screens/LoginScreen.tsx`, `src/screens/LoginScreen.test.tsx`
- Modify: `src/App.tsx` (`/login`), `src/screens/LandingScreen.tsx` (a link in the header: "Sign in" when signed out,
  "Signed in as <username> · Sign out" when signed in)

**Interfaces:**
- Consumes: `login`, `signup`, `logout`, `useAuth` (Task 5).
- Produces: `safeNext(raw: string | null): string` exported from `LoginScreen.tsx`: returns `raw` only when it starts
  with `/` and not `//` or `/\`; otherwise `/`.

Read `docs/DESIGN.md` first; build the form from the existing `DialogBox` and button styles. One form with a toggle
between "Sign in" and "Create account"; labelled inputs (`autocomplete="username"`, `current-password` /
`new-password`); the API's error message shown in a `role="alert"` region; the submit button disabled while the
request runs. On success, `window.location.assign(safeNext(next))`.

- [ ] **Step 1: Write the failing tests**: signing in calls the API and navigates to `next`; a wrong password shows
  `Wrong username or password`; "Create account" calls signup; `safeNext` for `/battle` → `/battle`,
  `https://evil.com` → `/`, `//evil.com` → `/`, `/\evil.com` → `/`, null → `/`; the landing header shows "Sign in"
  signed out and the username signed in.
- [ ] **Step 2: Run, verify FAIL.**  **Step 3: Implement.**  **Step 4: Verify** — `pnpm lint && pnpm test && pnpm
  build`; manual: with `pnpm dev:api` and `pnpm dev`, create an account, reload (still signed in), sign out, sign in.
- [ ] **Step 5: Commit** — `"Add the sign-in screen"`

---

### Task 7: Deploy checks and docs

**Files:**
- Modify: `.github/workflows/deploy.yml`, `docs/backend/decisions.md`, `product/interview-questions.md` (private)

- [ ] **Smoke test** (after the API checks): `POST $API_URL/api/auth/login` with a made-up user → 401 and
  `.error == "Wrong username or password"`; `GET $API_URL/api/me` without a token → 401. No smoke test creates users
  (it would add a row to the prod database on every deploy).
- [ ] **Decisions** (template): argon2id at 19 MiB / t=2 / p=1 (rejected: library default 64 MiB on a 512 MiB
  instance; bcrypt, older and caps passwords at 72 bytes); HS256 with the algorithm pinned (rejected: RS256, needs key
  pairs for no benefit with one service); same answer and same work for unknown users; usernames unique ignoring case;
  hashing in the thread pool; no sign-in gating until slice 4; no login rate limit yet (named in "what I'd add").
- [ ] **Interview questions** (🔴): what's inside the JWT and who can read it (anyone: it's signed, not encrypted);
  how the signature is checked; why pin the algorithm; why the same error and same work for unknown users; why argon2
  and what its parameters cost; why hashing goes to the thread pool; what happens when a token expires; what a
  stolen token can do and for how long.
- [ ] **Commit, push, PR.** Expected: CI green; preview comment shows only the API image and services updating.
- [ ] **Owner merges; Claude watches the deploy and runs the smoke checks.**
- [ ] **Walkthrough (owner):** trace `POST /api/auth/login` and then `GET /api/me` with the token: body parsing,
  the lookup, the verify, what's signed into the token, and how `current_user` turns the header back into a user.
