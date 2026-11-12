#!/bin/sh
# Commit everything and push to GitHub. Vercel deploys the new version automatically.
# Usage: ./ship.sh "what changed"
cd "$(dirname "$0")" || exit 1
msg="${1:-Update}"
git add -A
git commit -qm "$msg" && echo "Committed: $msg" || echo "Nothing new to commit"
git push -q && echo "Pushed. Vercel will update https://cabin-garage-oz2i.vercel.app in about a minute."
