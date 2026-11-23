#!/bin/sh
# Installs a tagged release: backup → checkout → build → stop app → migrate → start → health.
# Usage: scripts/update.sh vX.Y.Z   (first run on a new box = first install, no backup)
# See docs/RUNBOOK.md and ADR 0008.
set -eu
DEPLOY_ROOT="${DEPLOY_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
# shellcheck source=scripts/lib/common.sh
. "$(dirname "$0")/lib/common.sh"
# shellcheck source=scripts/lib/box-env.sh
. "$(dirname "$0")/lib/box-env.sh"
reexec_from_copy update.sh "$@"

tag=${1:-}
valid_tag "$tag" || die "usage: update.sh vX.Y.Z (got '${tag}')"
require_env_file
cd "$DEPLOY_ROOT"
[ -z "$(git status --porcelain)" ] || die "working tree has local changes: commit or stash them"
acquire_lock

current=$(read_state current)
pending=$(read_state in-progress)
# A failed update left the DB possibly migrated: a new dump would replace the good restore point.
[ -z "$pending" ] || die "update to $pending did not finish: run scripts/rollback.sh first"
[ "$current" != "$tag" ] || die "$tag is already installed"
git fetch --quiet --tags origin || log "warning: git fetch failed, using local tags"
commit=$(git rev-parse --quiet --verify "refs/tags/$tag^{commit}") || die "tag $tag not found"
# An older release would run on a newer schema: going back is scripts/rollback.sh's job.
if [ -n "$current" ]; then
	newest=$(printf '%s\n%s\n' "$current" "$tag" | sort -V | tail -n 1)
	[ "$newest" = "$tag" ] || die "$tag is older than the installed $current: use scripts/rollback.sh"
fi
# Opt-in (RUNBOOK): with the owner's public key in .deploy/allowed_signers, only tags signed by
# it are installed, so a stolen GitHub login can't ship code to the box.
signers="$STATE_DIR/allowed_signers"
if [ -s "$signers" ]; then
	# SSH signatures only: GPG ones would be checked against whatever keyring the box has.
	git -c gpg.ssh.program=ssh-keygen -c gpg.ssh.allowedSignersFile="$signers" \
		-c gpg.openpgp.program=false -c gpg.x509.program=false \
		verify-tag "refs/tags/$tag" >/dev/null 2>&1 ||
		die "tag $tag is not signed by a key in $signers: not installing it"
	# A signed tag object of an old release, pushed again under a new name, still verifies.
	[ "$(git cat-file tag "refs/tags/$tag" | sed -n 's/^tag //p')" = "$tag" ] ||
		die "tag $tag carries another release's signed tag: not installing it"
	log "tag $tag: signature verified"
else
	log "warning: release tags are not verified (no $signers, see RUNBOOK)"
fi
ensure_app_database_url

on_failure() {
	status=$?
	cleanup
	[ "$status" -eq 0 ] && return
	log "update to $tag FAILED."
	[ -n "$current" ] && log "To return to $current and its pre-update dump: scripts/rollback.sh"
}
trap on_failure EXIT

compose_at "${current:-$tag}" up -d --wait db
if [ -n "$current" ]; then
	dump=$(sh "$(dirname "$0")/pre-update-backup.sh" "$current-before-$tag")
	write_state last-backup "$dump"
	write_state previous "$current"
	write_state in-progress "$tag"
else
	log "first install: no previous release, skipping backup"
fi

# Files from the release must be readable by the containers: common.sh sets umask 077.
# The commit resolved (and verified) above, not the name: a tag moved since, or a branch called
# the same, can't change what is installed.
(umask 022 && git -c advice.detachedHead=false checkout --quiet "$commit")
log "building $tag"
compose_at "$tag" build app migrate
[ -n "$current" ] && compose_at "$current" stop app
log "migrating"
compose_at "$tag" run --rm migrate
compose_at "$tag" up -d --no-deps app caddy
wait_healthy "$tag" || die "$tag did not pass the health check"

write_state current "$tag"
clear_state in-progress
prune_images
log "installed $tag"
