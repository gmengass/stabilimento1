#!/bin/sh
# Pre-update restore point: pg_dump of the running database (ADR 0003, ADR 0008).
# Usage: scripts/pre-update-backup.sh <label>   Prints the dump path on stdout.
# Owner-only, plaintext, on the box only; keeps the newest 3. Nightly encrypted copies:
# scripts/backup.sh (ADR 0022).
set -eu
DEPLOY_ROOT="${DEPLOY_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
# shellcheck source=scripts/lib/common.sh
. "$(dirname "$0")/lib/common.sh"
# shellcheck source=scripts/lib/backup.sh
. "$(dirname "$0")/lib/backup.sh"

label=${1:?usage: pre-update-backup.sh <label>}
backup_dir=$(env_value BACKUP_DIR)
backup_dir="${backup_dir:-$DEPLOY_ROOT/backups}/pre-update"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
file="$backup_dir/$(date -u +%Y%m%dT%H%M%SZ)_$label.dump"

dump_db "$file.tmp" || { rm -f "$file.tmp"; die "pg_dump failed or wrote an empty file"; }
mv "$file.tmp" "$file"

# Timestamped names sort oldest first.
find "$backup_dir" -maxdepth 1 -name '*.dump' | sort -r | tail -n +$((KEEP_RELEASES + 1)) |
	while read -r old; do rm -f "$old"; done
log "backup: $file"
printf '%s\n' "$file"
