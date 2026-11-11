#!/bin/sh
# Pre-update restore point: pg_dump of the running database (ADR 0003, ADR 0008).
# Usage: scripts/pre-update-backup.sh <label>   Prints the dump path on stdout.
# Owner-only files; keeps the newest 3. The Backups roadmap item adds nightly, encrypted,
# offsite copies.
set -eu
DEPLOY_ROOT="${DEPLOY_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
# shellcheck source=scripts/lib/common.sh
. "$(dirname "$0")/lib/common.sh"

label=${1:?usage: pre-update-backup.sh <label>}
backup_dir=$(env_value BACKUP_DIR)
backup_dir="${backup_dir:-$DEPLOY_ROOT/backups}/pre-update"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
file="$backup_dir/$(date -u +%Y%m%dT%H%M%SZ)_$label.dump"

# shellcheck disable=SC2016 # expanded inside the db container
(cd "$DEPLOY_ROOT" && docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc') >"$file.tmp" ||
	{ rm -f "$file.tmp"; die "pg_dump failed"; }
[ -s "$file.tmp" ] || { rm -f "$file.tmp"; die "pg_dump wrote an empty file"; }
mv "$file.tmp" "$file"

# Timestamped names sort oldest first.
find "$backup_dir" -maxdepth 1 -name '*.dump' | sort -r | tail -n +$((KEEP_RELEASES + 1)) |
	while read -r old; do rm -f "$old"; done
log "backup: $file"
printf '%s\n' "$file"
