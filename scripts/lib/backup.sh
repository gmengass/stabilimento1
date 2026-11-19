# Shared helpers for the backup scripts (ADR 0008, ADR 0022). POSIX sh, sourced after common.sh.

SCRATCH_DB=booking_restore_test
NIGHTLY_PATTERN='^[0-9]{8}T[0-9]{6}Z_.+\.dump\.age$'

# Runs $1 in the db container. $POSTGRES_* in $1 expand inside the container.
db_sh() { (cd "$DEPLOY_ROOT" && docker compose exec -T db sh -c "$1"); }

# pg_dump -Fc of the app database into file $1.
dump_db() {
	# shellcheck disable=SC2016 # expanded inside the db container
	db_sh 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' </dev/null >"$1" || return 1
	[ -s "$1" ]
}

# Restores dump file $1 into a fresh scratch database and prints its migration count (> 0).
restore_scratch() {
	# shellcheck disable=SC2016 # expanded inside the db container
	db_sh 'dropdb -U "$POSTGRES_USER" --if-exists '"$SCRATCH_DB"' &&
		createdb -U "$POSTGRES_USER" '"$SCRATCH_DB"' &&
		pg_restore -U "$POSTGRES_USER" -d '"$SCRATCH_DB"' --no-owner --exit-on-error' <"$1" ||
		return 1
	# shellcheck disable=SC2016 # expanded inside the db container
	count=$(db_sh 'psql -U "$POSTGRES_USER" -d '"$SCRATCH_DB"' -tAc "select count(*) from kysely_migration"' </dev/null) ||
		return 1
	printf '%s\n' "$count" | grep -Eq '^[1-9][0-9]*$'
}

drop_scratch() {
	# shellcheck disable=SC2016 # expanded inside the db container
	db_sh 'dropdb -U "$POSTGRES_USER" --if-exists '"$SCRATCH_DB" </dev/null >/dev/null 2>&1 || true
}

# BACKUP_RCLONE_REMOTE without a trailing slash; empty when not configured.
rclone_remote() { env_value BACKUP_RCLONE_REMOTE | sed 's:/*$::'; }

# Nightly backup names in a listing on stdin, newest first.
nightly_names() { grep -E "$NIGHTLY_PATTERN" | sort -r; }

# Writes the age secret key into file $1 (owner-only): the first line of stdin, or typed
# without echo when stdin is a terminal.
read_secret_key() {
	if [ -t 0 ]; then
		printf 'Paste the backup secret key (AGE-SECRET-KEY-1...): ' >&2
		stty -echo
		read -r key || key=
		stty echo
		printf '\n' >&2
	else
		read -r key || key=
	fi
	case $key in
	AGE-SECRET-KEY-1*) printf '%s\n' "$key" >"$1" ;;
	*) die "that is not an age secret key (it starts with AGE-SECRET-KEY-1)" ;;
	esac
}

# Escapes $1 for a double-quoted curl config value.
curl_quote() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

# Emails "backup failed at step $1". Never fails: a missing config is a warning.
send_alert() {
	url=$(env_value BACKUP_ALERT_SMTP_URL)
	from=$(env_value BACKUP_ALERT_FROM)
	to=$(env_value BACKUP_ALERT_TO)
	if [ -z "$url" ] || [ -z "$from" ] || [ -z "$to" ]; then
		log "WARN: backup alerts are not configured (BACKUP_ALERT_* in .env): nobody is told"
		return 0
	fi
	cfg=$(mktemp)
	user=$(env_value BACKUP_ALERT_SMTP_USER)
	[ -z "$user" ] || printf 'user = "%s"\n' "$(curl_quote "$user")" >"$cfg"
	set -- "$1"
	for rcpt in $to; do set -- "$@" --mail-rcpt "$rcpt"; done
	step=$1
	shift
	{
		printf 'From: %s\r\nTo: %s\r\n' "$from" "$(printf '%s' "$to" | sed 's/ /, /g')"
		printf 'Subject: Stabilimento: nightly backup FAILED (%s)\r\n' "$step"
		printf 'Date: %s\r\n\r\n' "$(LC_ALL=C date -R)"
		printf 'The nightly backup on %s failed at step: %s\r\n' "$(hostname)" "$step"
		printf 'Time: %s UTC\r\n' "$(date -u '+%Y-%m-%d %H:%M')"
		printf 'Details on the box: journalctl -u stabilimento-backup -n 100\r\n'
	} | curl -sS --max-time 60 --ssl-reqd --url "$url" -K "$cfg" --mail-from "$from" "$@" \
		--upload-file - >/dev/null || log "WARN: the alert email could not be sent"
	rm -f "$cfg"
	return 0
}
