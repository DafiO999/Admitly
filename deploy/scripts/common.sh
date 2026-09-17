#!/usr/bin/env bash

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
DEPLOY_DIR=$(cd -- "$SCRIPT_DIR/.." && pwd)
ENV_FILE=${ADMITLY_ENV_FILE:-"$DEPLOY_DIR/.env.production"}
if [[ $ENV_FILE != /* ]]; then
  ENV_FILE="$(pwd)/$ENV_FILE"
fi
PROJECT_NAME=${ADMITLY_PROJECT:-admitly}
COMPOSE=(docker compose --project-name "$PROJECT_NAME" --file "$DEPLOY_DIR/compose.prod.yml" --env-file "$ENV_FILE")

die() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

validate_configuration() {
  command -v docker >/dev/null 2>&1 || die 'Docker is required'
  docker compose version >/dev/null 2>&1 || die 'Docker Compose is required'
  [[ -f $ENV_FILE && -r $ENV_FILE ]] || die 'Production environment file is missing or unreadable'
  [[ ${ENV_FILE##*/} != env.production.example ]] || die 'Use an untracked production environment file'
  if grep -Eq '^SITE_DOMAIN=.*\.invalid([[:space:]]*)$|^(POSTGRES_PASSWORD|DATABASE_URL)=.*replace-with-' "$ENV_FILE"; then
    die 'Replace the example environment placeholders before running this script'
  fi
  "${COMPOSE[@]}" config --quiet || die 'Production Compose configuration is invalid'
}

service_id() {
  "${COMPOSE[@]}" ps -q "$1"
}

health_status() {
  docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$1" 2>/dev/null || true
}

wait_healthy() {
  local service=$1
  local attempts=${2:-60}
  local id status
  for ((i = 0; i < attempts; i += 1)); do
    id=$(service_id "$service")
    if [[ -n $id ]]; then
      status=$(health_status "$id")
      if [[ $status == healthy ]]; then
        return 0
      fi
      if [[ $status == exited || $status == dead ]]; then
        die "$service stopped before becoming healthy"
      fi
    fi
    sleep 2
  done
  die "$service did not become healthy"
}

require_running_database() {
  local id
  id=$(service_id db)
  [[ -n $id ]] || die 'Database service is not running'
  [[ $(health_status "$id") == healthy ]] || die 'Database service is not healthy'
}
