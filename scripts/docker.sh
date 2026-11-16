#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

if [ ! -f app/.env ] || [ ! -f api/.env ]; then
  printf '%s\n' 'Run sh scripts/setup-docker.sh to create app/.env and api/.env.' >&2
  exit 1
fi

exec docker compose --env-file app/.env --env-file api/.env "$@"
