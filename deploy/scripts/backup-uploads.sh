#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"

validate_configuration
command -v tar >/dev/null 2>&1 || die 'tar is required'

for service in api web caddy; do
  id=$(service_id "$service")
  if [[ -n $id && $(health_status "$id") != exited ]]; then
    die "Stop $service before a paired database and uploads backup"
  fi
done

volume="${PROJECT_NAME}_admitly_uploads"
docker volume inspect "$volume" >/dev/null 2>&1 || die 'Uploads volume is missing'

umask 077
BACKUP_DIR=${BACKUP_DIR:-"$DEPLOY_DIR/../backups"}
mkdir -p -- "$BACKUP_DIR"
timestamp=$(date -u +%Y-%m-%d_%H-%M-%S)
backup_path="$BACKUP_DIR/admitly_${timestamp}.uploads.tar"
[[ ! -e $backup_path ]] || die 'An uploads backup with this timestamp already exists'
temporary_path="${backup_path}.partial.$$"
trap 'rm -f -- "$temporary_path"' EXIT

docker run --rm --network none \
  --mount "type=volume,source=$volume,target=/uploads,readonly" \
  alpine:3.20 tar -C /uploads -cf - . > "$temporary_path" \
  || die 'Uploads backup failed'
[[ -s $temporary_path ]] || die 'Uploads backup was empty'
tar -tf "$temporary_path" >/dev/null || die 'Uploads backup validation failed'

mv -- "$temporary_path" "$backup_path"
trap - EXIT
printf 'Uploads backup saved: %s\n' "$backup_path"
