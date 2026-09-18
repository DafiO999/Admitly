#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"

validate_configuration
require_running_database

for service in api web caddy; do
  id=$(service_id "$service")
  if [[ -n $id && $(health_status "$id") != exited ]]; then
    die "Stop $service before a paired database and uploads backup"
  fi
done

BACKUP_TIMESTAMP=$(date -u +%Y-%m-%d_%H-%M-%S)
export BACKUP_TIMESTAMP
bash "$SCRIPT_DIR/backup-db.sh"
bash "$SCRIPT_DIR/backup-uploads.sh"
printf 'Backup pair complete: %s\n' "$BACKUP_TIMESTAMP"
