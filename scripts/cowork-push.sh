#!/usr/bin/env bash
# cowork-push.sh — push to GitHub using the PAT stored in the Google-Drive
# synced workspace folder. Lets any Cowork session push without re-prompting
# Kirk for a token.
#
# The credential file lives OUTSIDE the repo (at the workspace folder root
# next to SPEC.md/Storm Screenshots/etc., NOT at the repo root — the two
# happen to coincide because the Google Drive folder IS the repo root).
#
# Security notes:
#   - `.cowork-secrets` is explicitly listed in .gitignore; never commits.
#   - The token is scoped to this single repo with Contents:R/W only.
#   - If you lose the file or the token leaks, revoke at:
#     https://github.com/settings/personal-access-tokens
#     and paste a fresh PAT into Cowork — it'll rewrite this file.
set -euo pipefail

SECRETS_FILE="/sessions/adoring-sharp-wozniak/mnt/Partner CRM/.cowork-secrets"
if [[ ! -f "$SECRETS_FILE" ]]; then
  echo "error: $SECRETS_FILE not found." >&2
  echo "  → Ask Kirk to paste a fresh PAT; Cowork will recreate this file." >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$SECRETS_FILE"
if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  echo "error: GITHUB_TOKEN missing from $SECRETS_FILE" >&2
  exit 1
fi

BRANCH="${1:-main}"
REMOTE_URL="https://x-access-token:${GITHUB_TOKEN}@github.com/kirkd84/Partner-CRM.git"

# Redact token from any failure output.
git push "$REMOTE_URL" "$BRANCH" 2>&1 | sed "s|${GITHUB_TOKEN}|***REDACTED***|g"
exit_code=${PIPESTATUS[0]}

unset GITHUB_TOKEN
exit "$exit_code"
