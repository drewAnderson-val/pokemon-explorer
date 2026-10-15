#!/usr/bin/env bash
# Create or update this PR's comment whose body starts with the same first line
# (an HTML marker such as <!-- preview-env -->), so pushes don't add new comments.
#   upsert-pr-comment.sh "<body>"
set -euo pipefail

body="$1"
marker="${body%%$'\n'*}"
repo="$GITHUB_REPOSITORY"
pr=$(jq -r .pull_request.number "$GITHUB_EVENT_PATH")

id=$(gh api --paginate "repos/$repo/issues/$pr/comments" \
  --jq ".[] | select(.body | startswith(\"$marker\")) | .id" | head -n1)

if [[ -n "$id" ]]; then
  gh api -X PATCH "repos/$repo/issues/comments/$id" -f body="$body" >/dev/null
else
  gh api "repos/$repo/issues/$pr/comments" -f body="$body" >/dev/null
fi
