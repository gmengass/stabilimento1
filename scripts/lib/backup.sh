# Shared helpers for the backup scripts (ADR 0008, ADR 0022). POSIX sh, sourced after common.sh.

SCRATCH_DB=booking_restore_test
NIGHTLY_PATTERN='^[0-9]{8}T[0-9]{6}Z_.+\.dump\.age$'

# Runs $1 in the db container. $POSTGRES_* in $1 expand inside the container.
db_sh() { (cd "$DEPLOY_ROOT" && docker compose exec -T db sh -c "$1"); }

# Logs the first lines of PostgreSQL error file $1 without DETAIL/CONTEXT lines, which can
# quote customer data.
log_pg_errors() {
	[ -s "$1" ] || return 0
	grep -v -e 'DETAIL:' -e 'CONTEXT:' "$1" | head -n 5 | while read -r line; do log "  $line"; done
}

# pg_dump -Fc of the app database into file $1.
dump_db() {
	# shellcheck disable=SC2016 # expanded inside the db container
	db_sh 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' </dev/null >"$1" || return 1
	[ -s "$1" ]
}

# Dumps made since ADR 0028 grant tables to <POSTGRES_DB>_app; pg_restore stops on a grant to a
# role this cluster doesn't have yet. Creates it (no login, no grants) if missing. $1: runs psql
# in the db container, reading SQL from stdin (`db_sh` or a `compose_at ... exec -T` wrapper).
ensure_app_role() {
	ear_db=$(env_value POSTGRES_DB)
	ear_role="${ear_db:-booking}_app"
	printf '%s\n' "$ear_role" | grep -Eqx '[a-z0-9_]{1,59}' || die "unexpected database name '$ear_db'"
	"$1" <<SQL
select format('create role %I', '$ear_role')
where not exists (select from pg_roles where rolname = '$ear_role') \gexec
SQL
}

# psql on the maintenance database, SQL on stdin (for ensure_app_role).
db_psql() {
	# shellcheck disable=SC2016 # expanded inside the db container
	db_sh 'psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -q' >/dev/null
}

# Restores dump file $1 into a fresh scratch database; its migrations table must not be empty.
# PostgreSQL errors go to file $2.
restore_scratch() {
	ensure_app_role db_psql 2>"$2" || { log_pg_errors "$2"; return 1; }
	# shellcheck disable=SC2016 # expanded inside the db container
	db_sh 'dropdb -U "$POSTGRES_USER" --if-exists '"$SCRATCH_DB"' &&
		createdb -U "$POSTGRES_USER" '"$SCRATCH_DB"' &&
		pg_restore -U "$POSTGRES_USER" -d '"$SCRATCH_DB"' --no-owner --exit-on-error' \
		<"$1" 2>"$2" || { log_pg_errors "$2"; return 1; }
	# shellcheck disable=SC2016 # expanded inside the db container
	count=$(db_sh 'psql -U "$POSTGRES_USER" -d '"$SCRATCH_DB"' -tAc "select count(*) from kysely_migration"' \
		</dev/null 2>"$2") || { log_pg_errors "$2"; return 1; }
	printf '%s\n' "$count" | grep -Eq '^[1-9][0-9]*$'
}

drop_scratch() {
	# shellcheck disable=SC2016 # expanded inside the db container
	db_sh 'dropdb -U "$POSTGRES_USER" --if-exists '"$SCRATCH_DB" </dev/null >/dev/null 2>&1 || true
}

# BACKUP_DIR from .env, default backups/ in the checkout.
backup_root() {
	dir=$(env_value BACKUP_DIR)
	printf '%s\n' "${dir:-$DEPLOY_ROOT/backups}"
}

# An owner-only work directory inside the backup folder (not /tmp, which may be shared).
make_work_dir() {
	mkdir -p "$(backup_root)"
	mktemp -d "$(backup_root)/.work.XXXXXX"
}

# BACKUP_RCLONE_REMOTE without a trailing slash; empty when not configured.
rclone_remote() { env_value BACKUP_RCLONE_REMOTE | sed 's:/*$::'; }

# Nightly backup names in a listing on stdin, newest first. Names dated more than a day ahead
# are ignored, so nobody can plant "future" files that win `latest` or push real backups out.
nightly_names() {
	limit=$(date -u -d '+1 day' +%Y%m%dT%H%M%SZ)
	grep -E "$NIGHTLY_PATTERN" | awk -v limit="$limit" 'substr($0, 1, 16) <= limit' | sort -r
}

# Reads the age secret key into SECRET_KEY: the first line of stdin, or typed without echo when
# stdin is a terminal. The key is never written to a file.
read_secret_key() {
	if [ -t 0 ]; then
		printf 'Paste the backup secret key (AGE-SECRET-KEY-1...): ' >&2
		trap 'stty echo; exit 130' INT TERM
		stty -echo
		IFS= read -r SECRET_KEY || SECRET_KEY=
		stty echo
		trap 'exit 130' INT TERM
		printf '\n' >&2
	else
		IFS= read -r SECRET_KEY || SECRET_KEY=
	fi
	SECRET_KEY=$(printf '%s' "$SECRET_KEY" | tr -d ' \t\r')
	case $SECRET_KEY in
	AGE-SECRET-KEY-1*) ;;
	*) die "that is not an age secret key (it starts with AGE-SECRET-KEY-1)" ;;
	esac
}

# Decrypts file $1 into file $2 with SECRET_KEY, given to age on a pipe (printf is a builtin,
# so the key never appears in a command line).
decrypt_backup() { printf '%s\n' "$SECRET_KEY" | age -d -i - -o "$2" "$1"; }

# Escapes $1 for a double-quoted curl config value.
curl_quote() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

# Calls BACKUP_HEARTBEAT_URL, if set. The URL is a secret: it goes to curl on stdin, not argv.
send_heartbeat() {
	heartbeat=$(env_value BACKUP_HEARTBEAT_URL)
	[ -n "$heartbeat" ] || return 0
	printf 'url = "%s"\n' "$(curl_quote "$heartbeat")" |
		curl -fsS --max-time 30 --retry 3 -K - >/dev/null || log "WARN: the heartbeat URL did not answer"
}

valid_address() { printf '%s\n' "$1" | grep -Eq '^[^]<>,"()[:space:][]+@[^]<>,"()[:space:][]+$'; }

# Emails "backup failed at step $1", with directory $2 for the curl config. Never fails: a
# missing or invalid config is a warning.
send_alert() {
	url=$(env_value BACKUP_ALERT_SMTP_URL)
	from=$(env_value BACKUP_ALERT_FROM)
	to=$(env_value BACKUP_ALERT_TO)
	if [ -z "$url" ] || [ -z "$from" ] || [ -z "$to" ]; then
		log "WARN: backup alerts are not configured (BACKUP_ALERT_* in .env): nobody is told"
		return 0
	fi
	valid_address "$from" || { log "WARN: BACKUP_ALERT_FROM is not an email address: no alert"; return 0; }
	alert_step=$1
	cfg="$2/curl-alert.conf"
	{
		printf 'url = "%s"\n' "$(curl_quote "$url")"
		user=$(env_value BACKUP_ALERT_SMTP_USER)
		[ -z "$user" ] || printf 'user = "%s"\n' "$(curl_quote "$user")"
	} >"$cfg"
	set -f
	set --
	for rcpt in $to; do
		if ! valid_address "$rcpt"; then
			set +f
			log "WARN: BACKUP_ALERT_TO has an invalid address: no alert"
			return 0
		fi
		set -- "$@" --mail-rcpt "$rcpt"
	done
	set +f
	{
		printf 'From: %s\r\nTo: %s\r\n' "$from" "$(printf '%s' "$to" | tr -s ' ' | sed 's/ /, /g')"
		printf 'Subject: Stabilimento: nightly backup FAILED (%s)\r\n' "$alert_step"
		printf 'Date: %s\r\n\r\n' "$(LC_ALL=C date -R)"
		printf 'The nightly backup on %s failed at step: %s\r\n' "$(hostname)" "$alert_step"
		printf 'Time: %s UTC\r\n' "$(date -u '+%Y-%m-%d %H:%M')"
		printf 'Details on the box: journalctl -u stabilimento-backup -n 100\r\n'
	} | curl -sS --max-time 60 --ssl-reqd -K "$cfg" --mail-from "$from" "$@" \
		--upload-file - >/dev/null || log "WARN: the alert email could not be sent"
	rm -f "$cfg"
	return 0
}
