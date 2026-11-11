# Shared helpers for scripts/update.sh and scripts/rollback.sh (ADR 0008). POSIX sh.
# Sourced, not executed. Expects DEPLOY_ROOT to be the repository checkout on the box.

STATE_DIR="$DEPLOY_ROOT/.deploy"
LOCK_DIR="$STATE_DIR/lock"
HEALTH_RETRIES="${HEALTH_RETRIES:-30}"
HEALTH_DELAY="${HEALTH_DELAY:-2}"

log() { printf '%s %s\n' "$(date -u +%H:%M:%SZ)" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

# Re-runs the calling script from a temp copy of scripts/, so checking out another tag can't
# change the script while it runs.
reexec_from_copy() {
	[ -n "${DEPLOY_REEXEC:-}" ] && return 0
	script=$1
	shift
	copy=$(mktemp -d)
	cp -R "$DEPLOY_ROOT/scripts" "$copy/"
	DEPLOY_REEXEC=1 DEPLOY_ROOT="$DEPLOY_ROOT" exec sh "$copy/scripts/$script" "$@"
}

valid_tag() { printf '%s\n' "$1" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$'; }

require_env_file() { [ -f "$DEPLOY_ROOT/.env" ] || die ".env missing: copy .env.example and fill it in"; }

# Value of KEY in .env (last assignment wins), without sourcing the file.
env_value() { sed -n "s/^$1=//p" "$DEPLOY_ROOT/.env" | tail -n 1; }

acquire_lock() {
	mkdir -p "$STATE_DIR"
	mkdir "$LOCK_DIR" 2>/dev/null || die "another deploy or backup is running ($LOCK_DIR)"
	trap 'rmdir "$LOCK_DIR" 2>/dev/null' EXIT
	trap 'exit 130' INT TERM
}

read_state() { cat "$STATE_DIR/$1" 2>/dev/null || true; }
write_state() { printf '%s\n' "$2" >"$STATE_DIR/$1.tmp" && mv "$STATE_DIR/$1.tmp" "$STATE_DIR/$1"; }
clear_state() { rm -f "$STATE_DIR/$1"; }

# docker compose for release $1 (image tag), run from the checkout.
compose_at() {
	version=$1
	shift
	(cd "$DEPLOY_ROOT" && APP_VERSION="$version" docker compose "$@")
}

wait_healthy() {
	version=$1
	i=0
	while [ "$i" -lt "$HEALTH_RETRIES" ]; do
		body=$(compose_at "$version" exec -T app wget -qO- http://127.0.0.1:3000/health 2>/dev/null || true)
		[ "$body" = '{"status":"ok","db":"ok"}' ] && return 0
		i=$((i + 1))
		sleep "$HEALTH_DELAY"
	done
	return 1
}

# Keeps the images of the newest 3 releases.
prune_images() {
	for repo in stabilimento-app stabilimento-migrate; do
		docker image ls "$repo" --format '{{.Tag}}' | grep -E '^v[0-9]' | sort -V -r | tail -n +4 |
			while read -r old; do docker image rm "$repo:$old" >/dev/null || true; done
	done
}
