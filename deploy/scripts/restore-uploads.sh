#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"

if [[ $# -ne 2 ]]; then
  printf 'Usage: %s BACKUP.uploads.tar --confirm-volume=VOLUME_NAME\n' "$0" >&2
  exit 2
fi
backup_path=$1
confirmation=$2
[[ -f $backup_path && -s $backup_path ]] || die 'Uploads backup is missing or empty'

validate_configuration
command -v tar >/dev/null 2>&1 || die 'tar is required'
volume="${PROJECT_NAME}_admitly_uploads"
printf 'Restore target volume: %s\n' "$volume"
[[ $confirmation == "--confirm-volume=$volume" ]] \
  || die 'Explicit confirmation must match the target uploads volume'
docker volume inspect "$volume" >/dev/null 2>&1 || die 'Uploads volume is missing'

for service in api web caddy; do
  id=$(service_id "$service")
  if [[ -n $id && $(health_status "$id") != exited ]]; then
    die "Stop $service before restoring uploads"
  fi
done

tar -tf "$backup_path" >/dev/null || die 'Uploads backup is not a valid tar archive'
while IFS= read -r entry; do
  [[ $entry == ./ || $entry =~ ^\./[0-9a-f-]{36}(\.deleting-[0-9a-f-]{36})?$ ]] \
    || die 'Uploads backup contains an unexpected path'
done < <(tar -tf "$backup_path")
while IFS= read -r line; do
  [[ $line == -* || $line == d* ]] || die 'Uploads backup contains a link or special file'
done < <(tar -tvf "$backup_path")

docker run --rm --network none --mount "type=volume,source=$volume,target=/uploads" \
  alpine:3.20 sh -c 'find /uploads -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +' \
  || die 'Could not clear the target uploads volume'
docker run --rm --network none -i --mount "type=volume,source=$volume,target=/uploads" \
  alpine:3.20 tar -C /uploads -xf - < "$backup_path" \
  || die 'Uploads restore failed'
docker run --rm --network none --mount "type=volume,source=$volume,target=/uploads" \
  alpine:3.20 sh -c 'chown -R 1000:1000 /uploads && chmod 700 /uploads' \
  || die 'Could not set uploads ownership'

printf 'Uploads restore complete.\n'
