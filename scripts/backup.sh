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

finish() {
	status=$?
	[ -n "$scratch" ] && drop_scratch
	[ -n "$work" ] && rm -rf "$work"
	if [ "$status" -ne 0 ]; then
		log "backup FAILED at step: $step"
		send_alert "$step"
	fi
	cleanup
}
trap finish EXIT

require_env_file
work=$(mktemp -d)

step=config
recipients="$work/recipients"
env_value BACKUP_AGE_RECIPIENTS | tr ' ' '\n' | sed '/^$/d' >"$recipients"
[ -s "$recipients" ] || die "BACKUP_AGE_RECIPIENTS is empty in .env: add the backup public key"
printf 'check' | age -R "$recipients" >/dev/null 2>&1 ||
	die "BACKUP_AGE_RECIPIENTS in .env is not a valid list of age public keys (age1...)"
remote=$(rclone_remote)
backup_dir=$(env_value BACKUP_DIR)
nightly="${backup_dir:-$DEPLOY_ROOT/backups}/nightly"
mkdir -p "$nightly"
chmod 700 "$nightly"

step=lock
acquire_lock_wait "${BACKUP_LOCK_WAIT:-1800}"
release=$(read_state current)
name="$(date -u +%Y%m%dT%H%M%SZ)_${release:-unknown}.dump.age"

step=dump
dump_db "$work/db.dump" || die "pg_dump failed or wrote an empty file"

step="restore check"
scratch=1
restore_scratch "$work/db.dump" || die "the dump did not restore into $SCRATCH_DB"
drop_scratch
scratch=

step=encrypt
age -R "$recipients" -o "$nightly/$name.tmp" "$work/db.dump" || die "age encryption failed"
rm -f "$work/db.dump"
mv "$nightly/$name.tmp" "$nightly/$name"
log "backup: $nightly/$name"

step=onedrive
if [ -z "$remote" ]; then
	log "WARN: BACKUP_RCLONE_REMOTE is empty: OneDrive copy skipped, the backup is on this box only"
else
	rclone copyto "$nightly/$name" "$remote/$name" || die "upload to $remote failed"
	rclone check "$nightly" "$remote" --one-way --include "$name" ||
		die "the copy on $remote does not match the local file"
	log "uploaded: $remote/$name"
fi

step=prune
find "$nightly" -maxdepth 1 -type f | sed 's:.*/::' | nightly_names | tail -n +$((KEEP + 1)) |
	while read -r old; do rm -f "$nightly/$old"; done
if [ -n "$remote" ]; then
	old_remote=$(rclone lsf --files-only "$remote") || die "listing $remote failed"
	printf '%s\n' "$old_remote" | nightly_names | tail -n +$((KEEP + 1)) |
		while read -r old; do rclone deletefile "$remote/$old" || exit 1; done ||
		die "deleting old backups on $remote failed"
fi

step=heartbeat
heartbeat=$(env_value BACKUP_HEARTBEAT_URL)
if [ -n "$heartbeat" ]; then
	curl -fsS --max-time 30 --retry 3 "$heartbeat" >/dev/null ||
		log "WARN: the heartbeat URL did not answer"
fi
step=finished
log "nightly backup OK"
