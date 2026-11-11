# Writes the club box's .env from .env.example (scripts/setup-wsl.sh). POSIX sh, sourced.

# Sets KEY=VALUE in FILE: replaces the first assignment, or appends one. VALUE must not
# contain a newline or "|".
set_env_value() {
	file=$1 key=$2 value=$3
	case $value in *'|'*) die "value for $key must not contain |" ;; esac
	if grep -q "^$key=" "$file"; then
		sed -i "s|^$key=.*|$key=$value|" "$file"
	else
		printf '%s=%s\n' "$key" "$value" >>"$file"
	fi
}

# Creates FILE (mode 600) from .env.example for a box reached as NAME and IP, with fresh
# secrets. Never overwrites an existing FILE.
write_box_env() {
	file=$1 example=$2 name=$3 ip=$4
	[ ! -e "$file" ] || die "$file already exists: not overwriting"
	(umask 077 && cp "$example" "$file")
	set_env_value "$file" APP_URL "https://$name"
	set_env_value "$file" SITE_ADDRESS "$name, $ip"
	set_env_value "$file" TRUSTED_ORIGINS "https://$ip"
	set_env_value "$file" POSTGRES_PASSWORD "$(openssl rand -hex 24)"
	set_env_value "$file" AUTH_SECRET "$(openssl rand -hex 32)"
	set_env_value "$file" ADMIN_USERNAME ""
	set_env_value "$file" ADMIN_PASSWORD ""
}
