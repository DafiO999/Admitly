#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"

if [[ $# -ne 2 ]]; then
  printf 'Usage: %s BACKUP.dump --confirm-db=DATABASE_NAME\n' "$0" >&2
  exit 2
fi
backup_path=$1
confirmation=$2
[[ -f $backup_path && -s $backup_path ]] || die 'Backup file is missing or empty'

validate_configuration
require_running_database
target_database=$("${COMPOSE[@]}" exec -T db sh -c 'printf "%s" "$POSTGRES_DB"')
printf 'Restore target database: %s\n' "$target_database"
[[ $confirmation == "--confirm-db=$target_database" ]] \
  || die 'Explicit confirmation must match the target database name'

for service in api web caddy; do
  id=$(service_id "$service")
  if [[ -n $id && $(health_status "$id") != exited ]]; then
    die "Stop $service before restoring the database"
  fi
done

"${COMPOSE[@]}" exec -T db pg_restore --list < "$backup_path" > /dev/null \
  || die 'Backup is not a valid PostgreSQL custom-format dump'
"${COMPOSE[@]}" exec -T db sh -c \
  'PGPASSWORD="$POSTGRES_PASSWORD" exec pg_restore -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --single-transaction --exit-on-error --no-owner --no-acl' \
  < "$backup_path" || die 'Database restore failed'

printf 'Restore complete.\n'
