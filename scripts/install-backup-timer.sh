#!/bin/sh
# Installs age and rclone and the nightly backup timer (ADR 0022, docs/RUNBOOK.md "Backups").
# Usage: scripts/install-backup-timer.sh                 install for the current user (uses sudo)
#        scripts/install-backup-timer.sh --render <dir>   only write the filled-in units to <dir>
set -eu
DEPLOY_ROOT="${DEPLOY_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
# shellcheck source=scripts/lib/common.sh
. "$(dirname "$0")/lib/common.sh"

UNITS="stabilimento-backup.service stabilimento-backup.timer"

# Writes the units with this user and checkout filled in into directory $1.
render_units() {
	user=$(id -un)
	case "$DEPLOY_ROOT$user" in
	*[!A-Za-z0-9._/-]*) die "the checkout path and user name may only use letters, digits, . _ - /" ;;
	esac
	for unit in $UNITS; do
		sed -e "s|@USER@|$user|g" -e "s|@ROOT@|$DEPLOY_ROOT|g" \
			"$DEPLOY_ROOT/deploy/systemd/$unit" >"$1/$unit"
		chmod 644 "$1/$unit"
	done
}

if [ "${1:-}" = "--render" ]; then
	[ -d "${2:-}" ] || die "usage: install-backup-timer.sh --render <dir>"
	render_units "$2"
	exit 0
fi
[ $# -eq 0 ] || die "usage: install-backup-timer.sh [--render <dir>]"

require_env_file
[ -n "$(env_value BACKUP_AGE_RECIPIENTS)" ] ||
	log "WARN: BACKUP_AGE_RECIPIENTS is empty in .env: nightly runs fail until you add the key"
if ! command -v age >/dev/null || ! command -v rclone >/dev/null; then
	sudo apt-get update -q
	sudo apt-get install -y -q age rclone
fi
# The distro's rclone can be too old for OneDrive's current API. selfupdate checks the
# signature of the official release before replacing it.
sudo rclone selfupdate --stable ||
	log "WARN: rclone selfupdate failed: if OneDrive fails, install rclone from rclone.org"
chmod 600 "$HOME/.config/rclone/rclone.conf" 2>/dev/null || true
staging=$(mktemp -d)
render_units "$staging"
for unit in $UNITS; do
	sudo install -m 644 "$staging/$unit" "/etc/systemd/system/$unit"
done
rm -rf "$staging"
sudo systemctl daemon-reload
sudo systemctl enable --now stabilimento-backup.timer
systemctl list-timers stabilimento-backup.timer --no-pager >&2
log "backup timer installed. Run one backup now: sudo systemctl start stabilimento-backup"
