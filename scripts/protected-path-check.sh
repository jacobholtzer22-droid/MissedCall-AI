#!/usr/bin/env bash
# The protected-path check: does a branch touch the lead, booking or
# notification paths? Run before merging anything to main.
#
#   scripts/protected-path-check.sh <branch> [base]   (base defaults to origin/main)
#
# Diffs <base>...<branch> (changes on the branch since it left base) over the
# paths below. Exit 0 = none touched, 1 = at least one touched (listed),
# 2 = bad usage or unknown ref. Also says whether the branch fast-forwards.
set -euo pipefail

PROTECTED=(
  app/api/webhooks/
  app/api/contact/
  app/api/bookings/
  lib/notify-owner.ts
  lib/create-booking.ts
  lib/sms-cooldown.ts
  lib/contacts-check.ts
  lib/crm-utils.ts
  lib/google-calendar.ts
  lib/spam-score.ts
  middleware.ts
  next.config.js
  prisma/
)

branch="${1:-}"
base="${2:-origin/main}"
if [ -z "$branch" ]; then
  echo "usage: $0 <branch> [base]" >&2
  exit 2
fi

cd "$(git rev-parse --show-toplevel)"
git fetch -q origin 2>/dev/null || echo "warning: git fetch failed, comparing against the local $base" >&2
for ref in "$branch" "$base"; do
  git rev-parse -q --verify "$ref^{commit}" >/dev/null || { echo "unknown ref: $ref" >&2; exit 2; }
done

echo "$base $(git rev-parse --short "$base"), $branch $(git rev-parse --short "$branch")"
if git merge-base --is-ancestor "$base" "$branch"; then
  echo "fast-forward: yes"
else
  echo "fast-forward: no ($base has commits the branch does not)"
fi
echo "files changed: $(git diff --name-only "$base...$branch" | wc -l | tr -d ' ')"

hits="$(git diff --name-only "$base...$branch" -- "${PROTECTED[@]}")"
if [ -n "$hits" ]; then
  echo "PROTECTED PATHS TOUCHED:"
  printf '  %s\n' $hits
  exit 1
fi
echo "protected paths touched: none"
