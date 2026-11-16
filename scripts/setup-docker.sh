#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
umask 077
set -C

if [ ! -e api/.env ] && [ ! -L api/.env ]; then
  if [ -f .env ]; then
    printf '%s\n' 'Found a legacy root .env. Follow the upgrade guide to move its settings before starting.' >&2
    exit 1
  fi

  command -v openssl >/dev/null 2>&1 || {
    printf '%s\n' 'Install OpenSSL or fill in the four secrets in api/.env using api/.env.example.' >&2
    exit 1
  }

  auth_secret=$(openssl rand -hex 32)
  jwt_secret=$(openssl rand -hex 32)
  internal_secret=$(openssl rand -hex 32)
  encryption_key=$(openssl rand -hex 32)

  cat > api/.env <<ENV
# API and shared secrets. See api/.env.example for optional settings.
BETTER_AUTH_SECRET=$auth_secret
JWT_SECRET=$jwt_secret
INTERNAL_API_SECRET=$internal_secret
SANDBOX_ENCRYPTION_KEY=$encryption_key
ENV
fi

if [ ! -e app/.env ] && [ ! -L app/.env ]; then
  printf '%s\n' '# Web settings and branding. See app/.env.example for optional settings.' > app/.env
fi

printf '%s\n' 'Start the CMS with sh scripts/docker.sh up --build --wait.'
