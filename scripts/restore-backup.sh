#!/bin/sh
# Restores a nightly backup (ADR 0022). Asks for the secret key from the password manager.
#   scripts/restore-backup.sh --test latest       monthly test: scratch database, then dropped
#   scripts/restore-backup.sh [--yes] <file|latest>   REPLACES the app database (new box, disaster)
# `latest` is the newest backup on this box, or on OneDrive when the box has none.
set -eu
DEPLOY_ROOT="${DEPLOY_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
# shellcheck source=scripts/lib/common.sh
. "$(dirname "$0")/lib/common.sh"
# shellcheck source=scripts/lib/backup.sh
. "$(dirname "$0")/lib/backup.sh"

usage="usage: restore-backup.sh [--test] [--yes] <file|latest>"
test_only=
yes=
source=
for arg in "$@"; do
	case $arg in
	--test) test_only=1 ;;
	--yes) yes=1 ;;
	-*) die "$usage" ;;
	*) [ -z "$source" ] || die "$usage"; source=$arg ;;
	esac
done
[ -n "$source" ] || die "$usage"

work=
scratch=
finish() {
	[ -n "$scratch" ] && drop_scratch
	[ -n "$work" ] && rm -rf "$work"
	cleanup
}
trap finish EXIT

require_env_file
acquire_lock
work=$(mktemp -d)
read_secret_key "$work/key"

backup_dir=$(env_value BACKUP_DIR)
nightly="${backup_dir:-$DEPLOY_ROOT/backups}/nightly"
if [ "$source" = latest ]; then
	newest=$(find "$nightly" -maxdepth 1 -type f 2>/dev/null | sed 's:.*/::' | nightly_names | head -n 1)
	if [ -n "$newest" ]; then
		file="$nightly/$newest"
	else
		remote=$(rclone_remote)
		[ -n "$remote" ] || die "no backup in $nightly and BACKUP_RCLONE_REMOTE is empty"
		newest=$(rclone lsf --files-only "$remote" | nightly_names | head -n 1) ||
			die "listing $remote failed"
		[ -n "$newest" ] || die "no backup found on $remote"
		log "downloading $remote/$newest"
		rclone copyto "$remote/$newest" "$work/$newest" || die "download from $remote failed"
		file="$work/$newest"
	fi
else
	file=$source
fi
[ -s "$file" ] || die "backup not found: $file"

log "decrypting $(basename "$file")"
age -d -i "$work/key" -o "$work/db.dump" "$file" ||
	die "could not decrypt $(basename "$file"): wrong key or damaged file"
rm -f "$work/key"

if [ -n "$test_only" ]; then
	scratch=1
	restore_scratch "$work/db.dump" || die "the backup did not restore into $SCRATCH_DB"
	# shellcheck disable=SC2016 # expanded inside the db container
	db_sh 'psql -U "$POSTGRES_USER" -d '"$SCRATCH_DB"' -c "select
		(select count(*) from kysely_migration) as migrations,
		(select max(name) from kysely_migration) as latest_migration,
		(select count(*) from booking) as bookings,
		(select max(created_at) from booking) as newest_booking"' </dev/null >&2 ||
		die "the restored backup could not be read"
	log "restore test OK: $(basename "$file")"
	exit 0
fi

made_by=$(basename "$file" .dump.age | sed 's/^[^_]*_//')
current=$(read_state current)
[ -n "$current" ] || die "no release installed: run scripts/update.sh $made_by first"
log "Restoring $(basename "$file") over the app database of $current."
[ "$made_by" = "$current" ] ||
	log "WARN: the backup was made by $made_by. If the app fails, install it: scripts/update.sh $made_by"
log "Everything in the database now will be REPLACED."
if [ -z "$yes" ]; then
	printf 'Type yes to continue: ' >&2
	read -r answer </dev/tty || answer=
	[ "$answer" = "yes" ] || die "aborted"
fi

compose_at "$current" stop app
# shellcheck disable=SC2016 # expanded inside the db container
compose_at "$current" exec -T db sh -c \
	'dropdb -U "$POSTGRES_USER" --force "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"' </dev/null
# shellcheck disable=SC2016 # expanded inside the db container
compose_at "$current" exec -T db sh -c \
	'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --exit-on-error' <"$work/db.dump"
compose_at "$current" up -d --no-deps app caddy
wait_healthy "$current" || die "$current did not pass the health check after the restore"
log "restored $(basename "$file")"
