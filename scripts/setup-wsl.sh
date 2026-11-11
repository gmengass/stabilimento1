#!/bin/sh
# One-time setup of the club box inside WSL2 Ubuntu: RUNBOOK section A steps 3-4 and
# "First install". Safe to run again: finished steps are skipped.
# Usage (inside Ubuntu, in the checkout on the Linux disk):
#   git clone https://github.com/gmengass/stabilimento1 ~/stabilimento1
#   cd ~/stabilimento1 && sh scripts/setup-wsl.sh v0.1.0
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

step() { printf '\n== %s\n' "$*" >&2; }

ask() {
	prompt=$1 default=$2
	printf '%s [%s]: ' "$prompt" "$default" >&2
	read -r reply || reply=
	printf '%s\n' "${reply:-$default}"
}

ask_secret() {
	printf '%s: ' "$1" >&2
	stty -echo 2>/dev/null || true
	read -r reply || reply=
	stty echo 2>/dev/null || true
	printf '\n' >&2
	printf '%s\n' "$reply"
}

# Runs a command with docker access, also before a new login picks up the docker group.
with_docker() {
	if docker info >/dev/null 2>&1; then
		sh -c "$1"
	else
		sg docker -c "$1"
	fi
}

check_environment() {
	step "Checking the environment"
	grep -qi microsoft /proc/version || die "this script is for WSL2 (use RUNBOOK section B on Linux)"
	[ "$(id -u)" -ne 0 ] || die "run as your normal Ubuntu user, not root (sudo is used where needed)"
	case $DEPLOY_ROOT in /mnt/*) die "the checkout is on the Windows disk: clone it into ~/ instead" ;; esac
	sudo -v
}

enable_systemd() {
	step "systemd"
	if [ "$(ps -p 1 -o comm=)" = systemd ]; then
		log "systemd is running"
		return
	fi
	if grep -q '^\[boot\]' /etc/wsl.conf 2>/dev/null; then
		die "/etc/wsl.conf already has a [boot] section: add 'systemd=true' under it by hand"
	fi
	printf '[boot]\nsystemd=true\n' | sudo tee -a /etc/wsl.conf >/dev/null
	log "systemd enabled in /etc/wsl.conf."
	log "Now run 'wsl --shutdown' in Windows PowerShell, reopen Ubuntu and run this script again."
	exit 0
}

# The Windows user's profile folder as a WSL path, or nothing if Windows interop is off.
windows_profile() {
	profile=$(cmd.exe /c 'echo %USERPROFILE%' 2>/dev/null | tr -d '\r') || return 0
	[ -n "$profile" ] && wslpath "$profile" 2>/dev/null || true
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

install_docker() {
	step "Docker Engine"
	if ! command -v docker >/dev/null 2>&1; then
		sudo apt-get update -q
		sudo apt-get install -y -q ca-certificates curl git openssl gnupg
		sudo install -m 0755 -d /etc/apt/keyrings
		sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
		sudo chmod a+r /etc/apt/keyrings/docker.asc
		codename=$(. /etc/os-release && printf '%s' "$VERSION_CODENAME")
		printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu %s stable\n' \
			"$(dpkg --print-architecture)" "$codename" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
		sudo apt-get update -q
		sudo apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
	fi
	sudo systemctl enable --now docker >/dev/null
	major=$(sudo docker version --format '{{.Server.Version}}' | cut -d. -f1)
	[ "$major" -ge "$MIN_DOCKER_MAJOR" ] ||
		die "Docker Engine $major is too old: $MIN_DOCKER_MAJOR or later is needed (ADR 0008)"
	id -nG | tr ' ' '\n' | grep -qx docker || sudo usermod -aG docker "$(id -un)"
	log "Docker Engine $(sudo docker version --format '{{.Server.Version}}') is running"
}

lan_ip() { ip -4 route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p'; }

create_env() {
	step ".env"
	if [ -f "$DEPLOY_ROOT/.env" ]; then
		log ".env exists: keeping it"
		return
	fi
	name=$(ask "Name staff type in the browser" "stabilimento.local")
	ip=$(ask "This PC's fixed LAN IP (reserve it on the router)" "$(lan_ip)")
	[ -n "$ip" ] || die "no IP given"
	write_box_env "$DEPLOY_ROOT/.env" "$DEPLOY_ROOT/.env.example" "$name" "$ip"
	log "created .env (mode 600) with fresh secrets. Store a copy in the password manager."
}

first_install() {
	step "Installing $tag"
	if [ -n "$(read_state current)" ]; then
		log "$(read_state current) is already installed: use scripts/update.sh for updates"
		return
	fi
	with_docker "env -u DEPLOY_COPY sh '$DEPLOY_ROOT/scripts/update.sh' '$tag'"
}

create_admin() {
	step "First admin account"
	username=$(ask "Admin username (not 'admin')" "")
	[ -n "$username" ] || { log "skipped: run this script again to create the admin"; return; }
	password=$(ask_secret "Admin password (at least 10 characters, not stored)")
	version=$(read_state current)
	# Passed in the environment only, never written to .env.
	(
		export ADMIN_USERNAME="$username" ADMIN_PASSWORD="$password" APP_VERSION="$version"
		with_docker "cd '$DEPLOY_ROOT' && docker compose run --rm seed-admin"
	)
}

export_root_certificate() {
	step "Root certificate for staff devices"
	cert="$HOME/stabilimento-root.crt"
	copy="cd '$DEPLOY_ROOT' && APP_VERSION='$(read_state current)' docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt '$cert'"
	i=0
	until with_docker "$copy" 2>/dev/null; do
		i=$((i + 1))
		[ "$i" -lt 30 ] || die "Caddy has not created its root certificate: check 'docker compose logs caddy'"
		sleep 2
	done
	chmod 644 "$cert"
	downloads="$(windows_profile)/Downloads"
	if [ -d "$downloads" ] && [ "$downloads" != /Downloads ]; then
		cp "$cert" "$downloads/"
		log "copied to Windows Downloads\\stabilimento-root.crt (public certificate, not the key)"
	fi
}

backup_ca_key() {
	step "Encrypted backup of the CA key (caddy_data)"
	archive="$HOME/secrets/caddy_data.tgz.gpg"
	if [ -f "$archive" ]; then
		log "$archive exists: keeping it"
		return
	fi
	command -v gpg >/dev/null 2>&1 || sudo apt-get install -y -q gnupg
	install -d -m 700 "$HOME/secrets"
	with_docker "docker run --rm -v stabilimento_caddy_data:/d:ro -v '$HOME/secrets':/o alpine sh -c 'umask 077 && tar czf /o/caddy_data.tgz -C /d .'"
	log "Choose a passphrase and store it in the password manager:"
	gpg --symmetric --output "$archive" "$HOME/secrets/caddy_data.tgz"
	rm -f "$HOME/secrets/caddy_data.tgz"
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

name=$(env_value APP_URL)
step "Done"
log "Health check here: curl -k $name/health"
log "Next (RUNBOOK): Task Scheduler + firewall in Windows, reboot without logging in, trust"
log "the certificate on each tablet, then compare remote_ip in 'docker compose logs caddy'."
