#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"

validate_configuration
require_running_database

umask 077
BACKUP_DIR=${BACKUP_DIR:-"$DEPLOY_DIR/../backups"}
mkdir -p -- "$BACKUP_DIR"
timestamp=${BACKUP_TIMESTAMP:-$(date -u +%Y-%m-%d_%H-%M-%S)}
[[ $timestamp =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{2}-[0-9]{2}-[0-9]{2}$ ]] \
  || die 'Invalid backup timestamp'
backup_path="$BACKUP_DIR/admitly_${timestamp}.dump"
[[ ! -e $backup_path ]] || die 'A backup with this timestamp already exists'
temporary_path="${backup_path}.partial.$$"
trap 'rm -f -- "$temporary_path"' EXIT

"${COMPOSE[@]}" exec -T db sh -c \
  'PGPASSWORD="$POSTGRES_PASSWORD" exec pg_dump -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' \
  > "$temporary_path" || die 'Database backup failed'
[[ -s $temporary_path ]] || die 'Database backup was empty'
"${COMPOSE[@]}" exec -T db pg_restore --list < "$temporary_path" > /dev/null \
  || die 'Database backup validation failed'

mv -- "$temporary_path" "$backup_path"
trap - EXIT
printf 'Backup saved: %s\n' "$backup_path"
