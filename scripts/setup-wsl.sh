#!/bin/sh
# shellcheck disable=SC2016 # with_docker gets literal commands; values come from exported variables
# One-time setup of the club box inside WSL2 Ubuntu: RUNBOOK section A steps 3-4 and
# "First install". Safe to run again: finished steps are skipped.
# Usage (inside Ubuntu, in the checkout on the Linux disk):
#   git clone https://github.com/gmengass/stabilimento1 ~/stabilimento1
#   cd ~/stabilimento1 && sh scripts/setup-wsl.sh vX.Y.Z
# vX.Y.Z must be a release that contains this script (v0.1.1 or later).
# The Windows steps (WSL install, .wslconfig, firewall, power, Task Scheduler) are separate:
# see docs/RUNBOOK.md section A.
set -eu
DEPLOY_ROOT="${DEPLOY_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
# shellcheck source=scripts/lib/common.sh
. "$(dirname "$0")/lib/common.sh"
# shellcheck source=scripts/lib/box-env.sh
. "$(dirname "$0")/lib/box-env.sh"
reexec_from_copy setup-wsl.sh "$@"

tag=${1:-}
valid_tag "$tag" || die "usage: sh scripts/setup-wsl.sh vX.Y.Z (the release to install)"
MIN_DOCKER_MAJOR=28
DOCKER_KEY_FINGERPRINT=9DC858229FC7DD38854AE2D88D81803C0EBFCD88
CADDY_IMAGE=caddy:2.10-alpine
export DEPLOY_ROOT

step() { printf '\n== %s\n' "$*" >&2; }

ask() {
	printf '%s [%s]: ' "$1" "$2" >&2
	IFS= read -r reply || reply=
	printf '%s\n' "${reply:-$2}"
}

# Reads a line without echo; the terminal is restored even on Ctrl-C.
read_hidden() {
	printf '%s: ' "$1" >&2
	saved=$(stty -g 2>/dev/null) || saved=
	trap '[ -n "$saved" ] && stty "$saved"; exit 130' INT TERM
	stty -echo 2>/dev/null || true
	IFS= read -r reply || reply=
	[ -n "$saved" ] && stty "$saved"
	trap 'exit 130' INT TERM
	printf '\n' >&2
	printf '%s\n' "$reply"
}

# Runs a literal sh command with docker access, also before a new login picks up the docker
# group. Pass values through exported variables, never by pasting them into $1.
with_docker() {
	if docker info >/dev/null 2>&1; then
		sh -c "$1"
	else
		sg docker -c "$1"
	fi
}

# The Windows user's profile folder as a WSL path, or nothing if Windows interop is off.
windows_profile() {
	profile=$(cmd.exe /c 'echo %USERPROFILE%' 2>/dev/null | tr -d '\r') || return 0
	[ -n "$profile" ] && wslpath "$profile" 2>/dev/null || true
}

check_environment() {
	step "Checking the environment"
	grep -qi microsoft /proc/version || die "this script is for WSL2 (use RUNBOOK section B on Linux)"
	[ "$(id -u)" -ne 0 ] || die "run as your normal Ubuntu user, not root (sudo is used where needed)"
	case $DEPLOY_ROOT in /mnt/*) die "the checkout is on the Windows disk: clone it into ~/ instead" ;; esac
	git -C "$DEPLOY_ROOT" fetch --quiet --tags origin || log "warning: git fetch failed, using local tags"
	git -C "$DEPLOY_ROOT" cat-file -e "$tag:scripts/setup-wsl.sh" 2>/dev/null ||
		die "$tag does not exist or predates this script: use v0.1.1 or a later release"
	sudo -v
}

enable_systemd() {
	step "systemd"
	if [ "$(ps -p 1 -o comm=)" = systemd ]; then
		log "systemd is running"
		return
	fi
	restart="Now run 'wsl --shutdown' in Windows PowerShell, reopen Ubuntu and run this script again."
	if grep -Eq '^[[:space:]]*systemd[[:space:]]*=[[:space:]]*true' /etc/wsl.conf 2>/dev/null; then
		log "systemd is enabled in /etc/wsl.conf but not running yet. $restart"
		exit 0
	fi
	if grep -q '^\[boot\]' /etc/wsl.conf 2>/dev/null; then
		die "/etc/wsl.conf already has a [boot] section: add 'systemd=true' under it by hand"
	fi
	printf '[boot]\nsystemd=true\n' | sudo sh -c 'umask 022 && cat >>/etc/wsl.conf'
	log "systemd enabled in /etc/wsl.conf. $restart"
	exit 0
}

check_mirrored_networking() {
	step "Mirrored networking (Windows .wslconfig)"
	config="$(windows_profile)/.wslconfig"
	if grep -qi '^networkingMode *= *mirrored' "$config" 2>/dev/null; then
		log "mirrored networking is on"
	else
		log "WARNING: networkingMode=mirrored not found in $config."
		log "Tablets won't reach the box until it is set (RUNBOOK section A step 5)."
	fi
}

add_docker_apt_repo() {
	key=$(mktemp)
	curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o "$key"
	fingerprint=$(gpg --show-keys --with-colons "$key" | awk -F: '$1 == "fpr" { print $10; exit }')
	[ "$fingerprint" = "$DOCKER_KEY_FINGERPRINT" ] ||
		{ rm -f "$key"; die "Docker's apt key has an unexpected fingerprint: $fingerprint"; }
	sudo install -m 0755 -d /etc/apt/keyrings
	sudo install -m 0644 "$key" /etc/apt/keyrings/docker.asc
	rm -f "$key"
	codename=$(. /etc/os-release && printf '%s' "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
	printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu %s stable\n' \
		"$(dpkg --print-architecture)" "$codename" |
		sudo sh -c 'umask 022 && cat >/etc/apt/sources.list.d/docker.list'
}

install_docker() {
	step "Docker Engine"
	sudo sh -c 'umask 022 && apt-get update -q && apt-get install -y -q ca-certificates curl git openssl gnupg'
	if command -v docker >/dev/null 2>&1 && ! systemctl cat docker.service >/dev/null 2>&1; then
		die "a docker command without a docker service: Docker Desktop? Use Docker Engine (RUNBOOK A)"
	fi
	if ! command -v docker >/dev/null 2>&1; then
		add_docker_apt_repo
		sudo sh -c 'umask 022 && apt-get update -q && apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin'
	fi
	sudo systemctl enable --now docker >/dev/null
	version=$(sudo docker version --format '{{.Server.Version}}')
	[ "${version%%.*}" -ge "$MIN_DOCKER_MAJOR" ] ||
		die "Docker Engine $version is too old: $MIN_DOCKER_MAJOR or later is needed (ADR 0008)"
	sudo docker compose version >/dev/null 2>&1 ||
		die "the Docker Compose plugin is missing: sudo apt-get install docker-compose-plugin"
	id -nG | tr ' ' '\n' | grep -qx docker || sudo usermod -aG docker "$(id -un)"
	log "Docker Engine $version is running"
}

lan_ip() { ip -4 route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p'; }

create_env() {
	step ".env"
	if [ -f "$DEPLOY_ROOT/.env" ]; then
		log ".env exists: keeping it"
		[ -z "$(env_value ADMIN_PASSWORD)" ] ||
			log "WARNING: .env still contains ADMIN_PASSWORD: remove it after the admin exists"
		return
	fi
	name=$(ask "Name staff type in the browser" "stabilimento.local")
	ip=$(ask "This PC's fixed LAN IP (reserve it on the router)" "$(lan_ip)")
	write_box_env "$DEPLOY_ROOT/.env" "$DEPLOY_ROOT/.env.example" "$name" "$ip"
	log "created .env (mode 600) with fresh secrets. Store a copy in the password manager."
}

first_install() {
	step "Installing $tag"
	if [ -n "$(read_state current)" ]; then
		log "$(read_state current) is already installed: use scripts/update.sh for updates"
		return
	fi
	export TAG="$tag"
	with_docker 'env -u DEPLOY_COPY sh "$DEPLOY_ROOT/scripts/update.sh" "$TAG"'
}

ask_admin_password() {
	while :; do
		first=$(read_hidden "Admin password (at least 10 characters, not stored)")
		second=$(read_hidden "Same password again")
		if [ "$first" != "$second" ]; then
			log "the passwords differ: try again"
		elif [ ${#first} -lt 10 ]; then
			log "too short: at least 10 characters"
		else
			printf '%s\n' "$first"
			return
		fi
	done
}

create_admin() {
	step "First admin account"
	username=$(ask "Admin username (not 'admin'; empty to skip)" "")
	[ -n "$username" ] || { log "skipped: run this script again to create the admin"; return; }
	password=$(ask_admin_password)
	# Passed in the environment only, never written to .env or a command line.
	(
		APP_VERSION=$(read_state current)
		export ADMIN_USERNAME="$username" ADMIN_PASSWORD="$password" APP_VERSION
		with_docker 'cd "$DEPLOY_ROOT" && docker compose run --rm seed-admin'
	)
}

export_root_certificate() {
	step "Root certificate for staff devices"
	APP_VERSION=$(read_state current)
	export CERT="$HOME/stabilimento-root.crt" APP_VERSION
	errors=$(mktemp)
	i=0
	until with_docker 'cd "$DEPLOY_ROOT" && docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt "$CERT"' 2>"$errors"; do
		i=$((i + 1))
		if [ "$i" -ge 30 ]; then
			log "$(tail -n 1 "$errors")"
			rm -f "$errors"
			die "could not copy Caddy's root certificate (see the error above)"
		fi
		sleep 2
	done
	rm -f "$errors"
	chmod 644 "$CERT"
	downloads="$(windows_profile)/Downloads"
	if [ "$downloads" != /Downloads ] && [ -d "$downloads" ]; then
		cp "$CERT" "$downloads/"
		log "copied to Windows Downloads\\stabilimento-root.crt (public certificate, not the key)"
	fi
	log "SHA-256 fingerprint (check it on each tablet before trusting the certificate):"
	openssl x509 -noout -fingerprint -sha256 -in "$CERT" >&2
}

# Streams the caddy_data volume straight into gpg: the CA key never touches the disk in clear.
backup_ca_key() {
	step "Encrypted backup of the CA key (caddy_data)"
	archive="$HOME/secrets/caddy_data.tgz.gpg"
	if [ -s "$archive" ]; then
		log "$archive exists: keeping it"
		return
	fi
	install -d -m 700 "$HOME/secrets"
	failed="$HOME/secrets/.tar-failed"
	rm -f "$failed" "$archive.tmp"
	export CADDY_IMAGE FAILED="$failed"
	log "Choose a passphrase and store it in the password manager:"
	GPG_TTY=$(tty) && export GPG_TTY
	{ with_docker 'docker run --rm -v stabilimento_caddy_data:/d:ro "$CADDY_IMAGE" tar czf - -C /d .' ||
		: >"$failed"; } | gpg --symmetric --output "$archive.tmp" ||
		{ rm -f "$archive.tmp" "$failed"; die "gpg failed: no backup written"; }
	if [ -e "$failed" ] || [ ! -s "$archive.tmp" ]; then
		rm -f "$archive.tmp" "$failed"
		die "reading the caddy_data volume failed: no backup written"
	fi
	mv "$archive.tmp" "$archive"
	log "saved $archive: copy it off the box next to .env"
}

check_environment
enable_systemd
check_mirrored_networking
install_docker
create_env
first_install
create_admin
export_root_certificate
backup_ca_key

step "Done"
log "Health check here: curl -k $(env_value APP_URL)/health"
log "Next (RUNBOOK): Task Scheduler + firewall in Windows, reboot without logging in, trust"
log "the certificate on each tablet, then compare remote_ip in 'docker compose logs caddy'."
