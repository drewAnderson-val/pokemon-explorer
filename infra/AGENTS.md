# Infra: agent instructions

Two Pulumi (TypeScript) stacks share the state backend `gs://finny-take-home-pulumi-state`. See the root `README.md`
for the pipeline and `docs/decisions.md` for why it's split this way.

| Stack | Who runs it | Manages |
| --- | --- | --- |
| `infra/` (`prod`) | GitHub Actions on push to `main` | registry, image, runtime SA, Cloud Run, public access |
| `infra/bootstrap/` (`prod`) | a project owner, locally, rarely | state bucket, GitHub OIDC (WIF), deployer SA + roles |

## Rules

- **Never run the bootstrap stack from CI**, and never give the deployer service account IAM-admin roles. CI must not
  be able to change its own permissions.
- **Deploy by merging to `main`**, not with a local `pulumi up` on the app stack; the pipeline's smoke test is the
  check that a deploy worked.
- **Never edit Pulumi state by hand** (`pulumi state`, copying state files). Use `pulumi import` to adopt resources.
- **The state bucket is `protect`ed.** Don't remove that.
- **Preview before proposing a change:** `PULUMI_CONFIG_PASSPHRASE= pulumi preview --stack prod --diff`. Stack config
  holds no secrets, so the passphrase is empty. Local runs need application-default credentials and, for the app
  stack, Docker running.
- **Cloud Run paths ending in `z` are reserved** (`/healthz` 404s publicly). Probes and smoke tests use `/api/health`.
