#!/bin/sh
# Commit everything and deploy to Vercel (production).
# Usage: ./ship.sh "what changed"
cd "$(dirname "$0")" || exit 1
msg="${1:-Update}"
git add -A
git commit -qm "$msg" && echo "Committed: $msg" || echo "Nothing new to commit"
vercel deploy --prod --yes
