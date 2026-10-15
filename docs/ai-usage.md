# How I used AI on this project

> Skeleton: fill in before submitting. Reviewers care less about *whether* AI was used than about judgment:
> what you delegated, what you checked, and where you disagreed with it.

## Tools

- Claude Code (CLI), with repo instructions in `AGENTS.md` (shared with other agents via `CLAUDE.md` imports)
- _Others?_

## What I delegated

| Area | What the AI did | How I verified it |
| --- | --- | --- |
| Deployment | Cloud Run + Pulumi + GitHub Actions setup, bootstrap stack | _CI runs, smoke test, `pulumi preview` diffs_ |
| Frontend | _…_ | _…_ |

## Where I overrode or corrected it

- _Example: it picked `/healthz` for the health check; Cloud Run reserves paths ending in `z`, which the smoke test
  caught on the first deploy (see `docs/decisions.md`)._
- _…_

## What I wrote myself, and why

- _…_

## Guardrails

- Repo instructions (`AGENTS.md`) record the traps an agent can't infer from code, plus the decision-log rule.
- Every change goes through a PR: lint, typecheck and build, then `pulumi preview`. Deploys to `main` run a smoke test.
- AI review on every PR (`.github/workflows/ai-review.yml`): a Claude reviewer for bugs, security and repo rules,
  plus Anthropic's security scanner. Findings are suggestions; merging is a human decision.
