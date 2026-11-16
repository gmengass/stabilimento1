# Checks .env values for scripts/build-android.sh (ADR 0010, ADR 0011). POSIX sh, sourced.
# Expects log/die from lib/common.sh.

# Exactly https://host[:port], lowercase: no path, no trailing /, no *. Browsers send lowercase
# origins, and the APK compares them exactly.
valid_origin() {
	printf '%s\n' "$1" | grep -Eqx 'https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]{1,5})?'
}

origin_host() { printf '%s\n' "$1" | sed -e 's|^https://||' -e 's|:[0-9]*$||'; }

# Items of a comma- or space-separated list, one per line.
list_items() { printf '%s\n' "$1" | tr ',' ' ' | tr -s ' ' '\n' | sed '/^$/d'; }

# Whether $1 is one of the names/IPs in SITE_ADDRESS $2, so Caddy has a certificate for it.
in_site_address() {
	ias_host=$1
	list_items "$2" | tr '[:upper:]' '[:lower:]' | grep -Fqx "$ias_host"
}

# Refuses values the APK can't use: APP_URL $1, TRUSTED_ORIGINS $2, REMOTE_URL $3 (optional),
# SITE_ADDRESS $4.
check_android_config() {
	cac_app=$1 cac_trusted=$2 cac_remote=$3 cac_site=$4
	set -f # a * in an origin must not expand to file names
	valid_origin "$cac_app" || die "APP_URL must be an https origin like https://stabilimento.local (got '$cac_app')"
	for cac_origin in $(list_items "$cac_trusted"); do
		valid_origin "$cac_origin" || die "TRUSTED_ORIGINS: '$cac_origin' is not an https origin (no path, no trailing /, lowercase)"
	done
	if [ -n "$cac_remote" ]; then
		valid_origin "$cac_remote" || die "REMOTE_URL must be an https origin (got '$cac_remote')"
		list_items "$cac_trusted" | grep -Fqx "$cac_remote" ||
			die "REMOTE_URL $cac_remote must also be in TRUSTED_ORIGINS, or sign-in fails there (ADR 0011)"
	fi
	for cac_origin in "$cac_app" $(list_items "$cac_trusted"); do
		cac_host=$(origin_host "$cac_origin")
		in_site_address "$cac_host" "$cac_site" ||
			die "$cac_host is not in SITE_ADDRESS, so Caddy has no certificate for it"
	done
	set +f
}
