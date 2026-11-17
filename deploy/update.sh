#!/usr/bin/env bash
# Met Rehook à jour depuis GitHub et reconstruit le conteneur s'il y a du nouveau.
set -euo pipefail
cd "$(dirname "$0")/.."
BRANCH=$(git rev-parse --abbrev-ref HEAD)
git fetch origin "$BRANCH" -q
if [ "$(git rev-parse HEAD)" != "$(git rev-parse "origin/$BRANCH")" ]; then
  echo "$(date -Is) mise à jour $(git rev-parse --short HEAD) -> $(git rev-parse --short "origin/$BRANCH")"
  git reset --hard "origin/$BRANCH" -q
  cd deploy && docker compose --env-file ../.env up -d --build
else
  echo "$(date -Is) à jour"
fi
