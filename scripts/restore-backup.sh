#!/bin/sh
# Restores a nightly backup (ADR 0022). Asks for the secret key from the password manager.
#   scripts/restore-backup.sh --test latest          monthly test: scratch database, then dropped
#   scripts/restore-backup.sh [--yes] <file|latest>  REPLACES the app database (new box, disaster)
# `latest` is the newest backup on this box, or on OneDrive when the box has none.
# The backup is restored into a scratch database first; only a good restore is swapped in, and
# the replaced database is kept as booking_before_restore until the next restore.
set -eu
DEPLOY_ROOT="${DEPLOY_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
# shellcheck source=scripts/lib/common.sh
. "$(dirname "$0")/lib/common.sh"
# shellcheck source=scripts/lib/backup.sh
. "$(dirname "$0")/lib/backup.sh"

OLD_DB=booking_before_restore
usage="usage: restore-backup.sh [--test] [--yes] <file|latest>"
test_only=
yes=
source=
for arg in "$@"; do
	case $arg in
	--test) test_only=1 ;;
	--yes) yes=1 ;;
	-*) die "$usage" ;;
	*)
		[ -z "$source" ] || die "$usage"
		source=$arg
		;;
	esac
done
[ -n "$source" ] || die "$usage"

work=
scratch=
app_down=
finish() {
	status=$?
	[ -n "$scratch" ] && drop_scratch
	[ -n "$work" ] && rm -rf "$work"
	if [ "$status" -ne 0 ] && [ -n "$app_down" ]; then
		log "The app is STOPPED. Fix the problem and run this script again, or start the app on"
		log "the database it has now: APP_VERSION=$current docker compose up -d --no-deps app"
	fi
	cleanup
}
trap finish EXIT

require_env_file
acquire_lock
work=$(make_work_dir)
read_secret_key

nightly="$(backup_root)/nightly"
if [ "$source" = latest ]; then
	newest=$(find "$nightly" -maxdepth 1 -type f 2>/dev/null | sed 's:.*/::' | nightly_names | head -n 1)
	if [ -n "$newest" ]; then
		file="$nightly/$newest"
	else
		remote=$(rclone_remote)
		[ -n "$remote" ] || die "no backup in $nightly and BACKUP_RCLONE_REMOTE is empty"
		listing=$(rclone lsf --files-only "$remote") || die "listing OneDrive failed"
		newest=$(printf '%s\n' "$listing" | nightly_names | head -n 1)
		[ -n "$newest" ] || die "no backup found on OneDrive"
		log "downloading $newest from OneDrive"
		rclone copyto "$remote/$newest" "$work/$newest" || die "download from OneDrive failed"
		file="$work/$newest"
	fi
else
	file=$source
fi
[ -s "$file" ] || die "backup not found: $file"
label=$(basename "$file")

log "decrypting $label"
decrypt_backup "$file" "$work/db.dump" || die "could not decrypt $label: wrong key or damaged file"
SECRET_KEY=

scratch=1
restore_scratch "$work/db.dump" "$work/pg.err" || die "$label did not restore into $SCRATCH_DB"
rm -f "$work/db.dump"

if [ -n "$test_only" ]; then
	# shellcheck disable=SC2016 # expanded inside the db container
	db_sh 'psql -U "$POSTGRES_USER" -d '"$SCRATCH_DB"' -c "select
		(select count(*) from kysely_migration) as migrations,
		(select max(name) from kysely_migration) as latest_migration,
		(select count(*) from booking) as bookings,
		(select max(created_at) from booking) as newest_booking"' </dev/null >&2 ||
		die "the restored backup could not be read"
	log "restore test OK: $label"
	exit 0
fi

made_by=$(basename "$file" .dump.age | sed 's/^[^_]*_//')
current=$(read_state current)
[ -n "$current" ] || die "no release installed: run scripts/update.sh $made_by first"
log "Backup $label (made $(printf '%s' "$label" | cut -c1-15) UTC by $made_by) restored and checked."
[ "$made_by" = "$current" ] ||
	log "WARN: the box runs $current. If the app fails afterwards: scripts/update.sh $made_by"
log "It will REPLACE the app database. The current one is kept as $OLD_DB."
if [ -z "$yes" ]; then
	printf 'Type yes to continue: ' >&2
	{ read -r answer </dev/tty; } 2>/dev/null || answer=
	[ "$answer" = "yes" ] || die "aborted: nothing changed"
fi

app_down=1
compose_at "$current" stop app
# Swap in the checked scratch database: both renames in one transaction, so either both happen
# or neither. The app is stopped; leftover connections are closed.
# shellcheck disable=SC2016 # expanded inside the db container
compose_at "$current" exec -T db sh -c 'psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -q \
	-c "drop database if exists '"$OLD_DB"'" \
	-c "select pg_terminate_backend(pid) from pg_stat_activity where datname in ('"'$SCRATCH_DB'"', '"'"'$POSTGRES_DB'"'"')" \
	-c "begin; alter database \"$POSTGRES_DB\" rename to '"$OLD_DB"';
		alter database '"$SCRATCH_DB"' rename to \"$POSTGRES_DB\"; commit"' </dev/null >/dev/null ||
	die "swapping in the restored database failed"
scratch=
# A backup made before ADR 0028, or on another box, has no grants for the app's account.
compose_at "$current" run --rm migrate grant >/dev/null || die "granting the app's database account failed"
compose_at "$current" up -d --no-deps app caddy
wait_healthy "$current" || die "$current did not pass the health check after the restore"
app_down=
log "restored $label. When all is well: docker compose exec db dropdb -U <POSTGRES_USER> $OLD_DB"
