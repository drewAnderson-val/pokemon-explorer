Repository context for the security review:

- This repository is (or will be) public. Treat any committed credential, token, private key, interview material or
  absolute personal path as a finding.
- The app is a React SPA plus an Express 5 JSON API (`frontend/server/app.ts`) on Google Cloud Run, publicly
  reachable. The data is static fake records; there is no auth, database or user data. Do not report missing
  authentication on the public read-only API as a vulnerability. Do report input handling that could crash the
  process, consume unbounded memory/CPU, or reflect input unsafely.
- Infrastructure is Pulumi (`infra/`). The GitHub Actions deployer authenticates via Workload Identity Federation
  restricted to this repository. Report any change that widens its IAM roles, loosens the WIF attribute condition,
  makes non-public resources public, or lets CI modify the bootstrap stack.
- GitHub Actions workflows: report `pull_request_target`, untrusted `${{ github.event.* }}` text interpolated into
  shell, overly broad `permissions:`, and unpinned third-party actions.
