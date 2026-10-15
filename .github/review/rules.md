# AI review rules

Custom rules for the AI reviewer (`.github/workflows/ai-review.yml`), on top of every `AGENTS.md`. Each rule is
scoped to paths. Flag a violation only when the PR introduces it.

**Teaching the reviewer:** when it flags something that's intentional, or misses something it should catch, add or
edit a rule here. That's its memory.

## Context

- Public repo; React SPA + Express 5 JSON API on Cloud Run, publicly reachable. Data is static fake records: there's
  no auth, database or user data, so don't report missing auth on the read-only API. Do report input handling that
  can crash the process, consume unbounded memory/CPU, or reflect input unsafely.

## Everywhere

- **Public repo:** no interview correspondence, product take-home material, credentials, tokens, or absolute personal
  paths (`/Users/...`). Severity: critical.
- **Decisions are logged:** a PR that picks between real alternatives (library, architecture, infra shape) should add
  an entry to `docs/decisions.md`. Severity: low.

## `frontend/src/**`

- List items and React keys use `id`, never `name` (names repeat). Severity: high.
- Every fetch handles loading, error and empty states. Severity: medium.
- Search ignores stale responses (abort or sequence check) and doesn't fire a request per keystroke. Severity: medium.
- Infinite scroll can't request the same page twice or keep fetching after `hasNext` is false. Severity: high.
- Images have `alt`, a fixed aspect ratio, `loading="lazy"` and a fallback for failed loads. Severity: medium.
- Interactive cards are keyboard-operable (button or proper role, focus visible, `aria-expanded`). Severity: medium.
- No `dangerouslySetInnerHTML` with API data. Severity: critical.
- Height and weight are formatted, never rendered as raw floats. Severity: low.

## `frontend/server/**`

- Query params are validated and bounded (`page >= 1`, `1 <= limit <= 100`, `search` length capped); invalid input
  returns 400, not nonsense. Severity: medium.
- API routes live in `app.ts` (dev and prod); prod-only concerns in `index.ts`. Severity: low.
- No route path ends in `z` (Cloud Run reserves them). Severity: high.

## `frontend/src/data/pokemon.json`

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
