#!/bin/sh
# Nightly backup (ADR 0022): pg_dump → scratch restore check → age encryption → box disk and
# OneDrive → keep the newest 14. Any failure emails an alert. Run by the stabilimento-backup
# systemd timer; safe to run by hand. Usage: scripts/backup.sh
set -eu
DEPLOY_ROOT="${DEPLOY_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
# shellcheck source=scripts/lib/common.sh
. "$(dirname "$0")/lib/common.sh"
# shellcheck source=scripts/lib/backup.sh
. "$(dirname "$0")/lib/backup.sh"
reexec_from_copy backup.sh "$@"

KEEP="${BACKUP_KEEP:-14}"
step=setup
work=
scratch=
partial=

finish() {
	status=$?
	[ -n "$scratch" ] && drop_scratch
	[ -n "$partial" ] && rm -f "$partial"
	if [ "$status" -ne 0 ]; then
		log "backup FAILED at step: $step"
		alert_dir=${work:-$(mktemp -d)}
		send_alert "$step" "$alert_dir"
		[ -n "$work" ] || rm -rf "$alert_dir"
	fi
	[ -n "$work" ] && rm -rf "$work"
	cleanup
}
trap finish EXIT

require_env_file
nightly="$(backup_root)/nightly"
mkdir -p "$nightly"
chmod 700 "$(backup_root)" "$nightly"
work=$(make_work_dir)

step=config
recipients="$work/recipients"
env_value BACKUP_AGE_RECIPIENTS | tr ' ' '\n' | sed '/^$/d' >"$recipients"
[ -s "$recipients" ] || die "BACKUP_AGE_RECIPIENTS is empty in .env: add the backup public key"
printf 'check' | age -R "$recipients" >/dev/null 2>&1 ||
	die "BACKUP_AGE_RECIPIENTS in .env is not a valid list of age public keys (age1...)"
remote=$(rclone_remote)

step=lock
acquire_lock_wait "${BACKUP_LOCK_WAIT:-1800}"
release=$(read_state current)
name="$(date -u +%Y%m%dT%H%M%SZ)_${release:-unknown}.dump.age"

step=dump
dump_db "$work/db.dump" || die "pg_dump failed or wrote an empty file"

step="restore check"
scratch=1
restore_scratch "$work/db.dump" "$work/pg.err" || die "the dump did not restore into $SCRATCH_DB"
drop_scratch
scratch=

step=encrypt
partial="$nightly/$name.tmp"
age -R "$recipients" -o "$partial" "$work/db.dump" || die "age encryption failed"
rm -f "$work/db.dump"
mv "$partial" "$nightly/$name"
partial=
log "backup: $nightly/$name"

step=onedrive
if [ -z "$remote" ]; then
	log "WARN: BACKUP_RCLONE_REMOTE is empty: OneDrive copy skipped, the backup is on this box only"
else
	rclone copyto "$nightly/$name" "$remote/$name" || die "upload to OneDrive failed"
	rclone check "$nightly" "$remote" --one-way --download --include "$name" ||
		die "the copy on OneDrive does not match the local file"
	log "uploaded to OneDrive: $name"
fi

step=prune
find "$nightly" -maxdepth 1 -type f | sed 's:.*/::' | nightly_names | tail -n +$((KEEP + 1)) |
	while read -r old; do rm -f "$nightly/$old"; done
if [ -n "$remote" ]; then
	listing=$(rclone lsf --files-only "$remote") || die "listing OneDrive failed"
	printf '%s\n' "$listing" | nightly_names | tail -n +$((KEEP + 1)) |
		while read -r old; do rclone deletefile "$remote/$old" || exit 1; done ||
		die "deleting old backups on OneDrive failed"
fi

step=heartbeat
send_heartbeat
[ -n "$(env_value BACKUP_HEARTBEAT_URL)" ] ||
	log "WARN: BACKUP_HEARTBEAT_URL is empty: nobody notices if backups stop running"
step=finished
log "nightly backup OK"
