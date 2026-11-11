#!/bin/sh
# Returns to the previous release AND its pre-update database dump. Data entered since the
# update is lost. Usage: scripts/rollback.sh [--yes]   See docs/RUNBOOK.md and ADR 0008.
set -eu
DEPLOY_ROOT="${DEPLOY_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
# shellcheck source=scripts/lib/common.sh
. "$(dirname "$0")/lib/common.sh"
reexec_from_copy rollback.sh "$@"

require_env_file
cd "$DEPLOY_ROOT"
acquire_lock

# After a failed update, `in-progress` names the release that was being installed.
from=$(read_state in-progress)
from=${from:-$(read_state current)}
previous=$(read_state previous)
dump=$(read_state last-backup)
[ -n "$previous" ] || die "no previous release recorded: nothing to roll back to"
[ -s "$dump" ] || die "pre-update dump not found: '$dump'"

log "Rollback $from → $previous, restoring $dump"
log "Everything entered after $(basename "$dump" | cut -d_ -f1) (UTC) will be LOST."
if [ "${1:-}" != "--yes" ]; then
	printf 'Type yes to continue: ' >&2
	read -r answer || answer=
	[ "$answer" = "yes" ] || die "aborted"
fi

git -c advice.detachedHead=false checkout --quiet "$previous"
compose_at "$previous" up -d --wait db
compose_at "$previous" stop app
# shellcheck disable=SC2016 # expanded inside the db container
compose_at "$previous" exec -T db sh -c \
	'dropdb -U "$POSTGRES_USER" --force "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
# shellcheck disable=SC2016 # expanded inside the db container
compose_at "$previous" exec -T db sh -c \
	'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --exit-on-error' <"$dump"
compose_at "$previous" up -d --no-deps app caddy
wait_healthy "$previous" || die "$previous did not pass the health check after the restore"

write_state current "$previous"
clear_state previous
clear_state last-backup
clear_state in-progress
log "rolled back to $previous"
