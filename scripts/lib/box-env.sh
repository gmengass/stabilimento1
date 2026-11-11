# Writes the club box's .env from .env.example (scripts/setup-wsl.sh). POSIX sh, sourced.

NL='
'

# Sets KEY=VALUE in FILE: replaces the first assignment, or appends one. VALUE is written
# literally (passed through the environment, never through a command line or sed).
# POSIX sh has no locals: the sev_ prefix keeps callers' variables intact.
set_env_value() {
	sev_file=$1 sev_key=$2
	case $3 in *"$NL"*) die "value for $sev_key must be a single line" ;; esac
	K=$sev_key V=$3 awk '
		BEGIN { k = ENVIRON["K"]; v = ENVIRON["V"] }
		!done && index($0, k "=") == 1 { print k "=" v; done = 1; next }
		{ print }
		END { if (!done) print k "=" v }
	' "$sev_file" >"$sev_file.tmp"
	cat "$sev_file.tmp" >"$sev_file"
	rm -f "$sev_file.tmp"
}

# A DNS name or single-label PC name: letters, digits and inner hyphens.
valid_hostname() {
	printf '%s\n' "$1" |
		grep -Eqx '[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*'
}

# A LAN IPv4 address: four octets 0-255, not 0.0.0.0 or loopback.
valid_lan_ipv4() {
	printf '%s\n' "$1" | grep -Eqx '([0-9]{1,3}\.){3}[0-9]{1,3}' || return 1
	case $1 in 0.0.0.0 | 127.*) return 1 ;; esac
	for octet in $(printf '%s' "$1" | tr . ' '); do
		[ "$octet" -le 255 ] || return 1
	done
}

# Creates FILE (mode 600) from .env.example for a box reached as NAME and IP, with fresh
# secrets. Never overwrites an existing FILE, and never leaves a partial one.
write_box_env() {
	file=$1 example=$2 name=$3 ip=$4
	valid_hostname "$name" || die "invalid name '$name': use letters, digits, dots and hyphens"
	valid_lan_ipv4 "$ip" || die "invalid IP '$ip': use the PC's LAN IPv4 address, e.g. 192.168.1.10"
	[ ! -e "$file" ] || die "$file already exists: not overwriting"
	# Browsers send lowercase origins; keep APP_URL and SITE_ADDRESS identical to them.
	name=$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]')
	db_password=$(openssl rand -hex 24) || db_password=
	auth_secret=$(openssl rand -hex 32) || auth_secret=
	[ ${#db_password} -eq 48 ] && [ ${#auth_secret} -eq 64 ] || die "openssl could not generate secrets"
	draft="$file.draft"
	(umask 077 && cp "$example" "$draft")
	set_env_value "$draft" APP_URL "https://$name"
	set_env_value "$draft" SITE_ADDRESS "$name, $ip"
	set_env_value "$draft" TRUSTED_ORIGINS "https://$ip"
	set_env_value "$draft" POSTGRES_PASSWORD "$db_password"
	set_env_value "$draft" AUTH_SECRET "$auth_secret"
	set_env_value "$draft" ADMIN_USERNAME ""
	set_env_value "$draft" ADMIN_PASSWORD ""
	mv "$draft" "$file"
}
