# AI review rules

Custom rules for the AI reviewer (`.github/workflows/ai-review.yml`), on top of every `AGENTS.md`. Each rule is
scoped to paths. Flag a violation only when the PR introduces it.

**Teaching the reviewer:** when it flags something that's intentional, or misses something it should catch, add or
edit a rule here. That's its memory.

## Context

- Public repo. A static React SPA (Caddy on Cloud Run) and a FastAPI JSON API (`api/`, its own Cloud Run service) on
  Cloud SQL Postgres, both publicly reachable. The API has user accounts (argon2id passwords, 1-hour JWTs), per-user
  teams, creatures and battles, so report missing or bypassable auth, one user reaching another's data, and SQL built
  from strings. Also report input handling that can crash the process, consume unbounded memory/CPU, or reflect input
  unsafely.

## Everywhere

- **Public repo:** no interview correspondence, product take-home material, credentials, tokens, or absolute personal
  paths (`/Users/...`). Severity: critical.
- **Decisions are logged:** a PR that picks between real alternatives (library, architecture, infra shape) should add
  an entry to `docs/backend/decisions.md`. Severity: low.

## `src/**`

- List items and React keys use `id`, never `name` (names repeat). Severity: high.
- Every fetch handles loading, error and empty states. Severity: medium.
- Search ignores stale responses (abort or sequence check) and doesn't fire a request per keystroke. Severity: medium.
- Infinite scroll can't request the same page twice or keep fetching after `hasNext` is false. Severity: high.
- Images have `alt`, a fixed aspect ratio, `loading="lazy"` and a fallback for failed loads. Severity: medium.
- Interactive cards are keyboard-operable (button or proper role, focus visible, `aria-expanded`). Severity: medium.
- No `dangerouslySetInnerHTML` with API data. Severity: critical.
- Height and weight are formatted, never rendered as raw floats. Severity: low.

## `api/**`

- Every route that reads or changes a user's data depends on `current_user`, and its SQL filters by that user's id
  (catalog queries keep `owner_id IS NULL`). Severity: critical.
- SQL uses bound parameters (`%s`), never values formatted into the string. Severity: critical.
- Query params and bodies are validated and bounded (`page >= 1`, `1 <= limit <= 100`, `search` length capped); invalid
  input returns 400 `{"error": ...}`, not nonsense or a 500. Severity: medium.
- Schema changes are a new numbered file in `app/db/migrations/`; applied migrations are never edited. Severity: high.
- No lock or open transaction is held across a slow outside call (Vertex AI, the bucket). Severity: high.
- No route path ends in `z` (Cloud Run reserves them). Severity: high.

## `Caddyfile`

- App routes fall back to `index.html`; `/api/*` is a JSON 404 (except `/api/health`), and a missing `/assets/*` file
  is a 404, never `index.html`. Severity: high.
- Only found `/assets/*` files are cached long (`immutable`); `index.html` is `no-cache`. Severity: high.

## `src/data/pokemon.json`

- Must not be regenerated (the generator is unseeded). Any large diff here is a bug. Severity: high.

## `infra/**`

- Never widen the GitHub deployer's IAM roles, and never manage the bootstrap stack from CI. Severity: critical.
- Shared resources (registry, runtime service account) are created only when `isProd`. Severity: high.
- Changes that would **replace or delete** the prod Cloud Run service, registry or state bucket need an explicit
  justification in the PR. Severity: high.
- The state bucket stays `protect`ed. Severity: high.

## `.github/workflows/**`

- No `pull_request_target`. Severity: critical.
- Never interpolate untrusted event fields (`github.event.pull_request.title`, `.body`, `.head.ref`, comment bodies)
  directly into `run:` scripts; pass them via `env:`. Severity: critical.
- Least-privilege `permissions:`; third-party (non-GitHub, non-Google, non-Anthropic, non-Pulumi) actions pinned to a
  commit SHA. Severity: medium.
- Jobs that apply infrastructure must never use `cancel-in-progress: true`. Severity: high.
