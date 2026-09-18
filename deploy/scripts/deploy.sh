#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"

validate_configuration

printf 'Building backend and frontend images...\n'
"${COMPOSE[@]}" build api web

printf 'Starting PostgreSQL...\n'
"${COMPOSE[@]}" up -d db
wait_healthy db

printf 'Applying production migrations...\n'
"${COMPOSE[@]}" run --rm --no-deps api npx --no-install prisma migrate deploy

printf 'Starting API...\n'
"${COMPOSE[@]}" up -d --no-deps --force-recreate api
wait_healthy api

printf 'Starting frontend...\n'
"${COMPOSE[@]}" up -d --no-deps --force-recreate web
wait_healthy web

printf 'Starting Caddy...\n'
"${COMPOSE[@]}" up -d --no-deps --force-recreate caddy
wait_healthy caddy

"${COMPOSE[@]}" exec -T api node -e \
  "fetch('http://127.0.0.1:3001/api/health').then(r => { if (!r.ok) process.exitCode = 1; }).catch(() => { process.exitCode = 1; })" \
  || die 'API health verification failed'
"${COMPOSE[@]}" exec -T api node -e \
  "fetch('http://127.0.0.1:3001/api/ready').then(r => { if (!r.ok) process.exitCode = 1; }).catch(() => { process.exitCode = 1; })" \
  || die 'API readiness verification failed'

printf 'Deployment healthy.\n'
"${COMPOSE[@]}" ps
