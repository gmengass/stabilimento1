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
# Caddy also accepts entries like https://name or name:443: compare the bare host.
in_site_address() {
	ias_host=$1
	list_items "$2" | tr '[:upper:]' '[:lower:]' | sed -e 's|^[a-z]*://||' -e 's|:[0-9]*$||' |
		grep -Fqx "$ias_host"
}

# Whether $1 is an IPv4 address.
is_ipv4() { printf '%s\n' "$1" | grep -Eqx '([0-9]{1,3}\.){3}[0-9]{1,3}'; }

# Refuses values the APK can't use: APP_URL $1, TRUSTED_ORIGINS $2, REMOTE_URL $3 (optional),
# SITE_ADDRESS $4, DEFAULT_SNI $5.
check_android_config() {
	cac_app=$1 cac_trusted=$2 cac_remote=$3 cac_site=$4 cac_sni=$5
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
	# The app opens APP_URL and REMOTE_URL. By IP, Caddy only answers with DEFAULT_SNI's certificate.
	for cac_origin in "$cac_app" $cac_remote; do
		cac_host=$(origin_host "$cac_origin")
		if is_ipv4 "$cac_host" && [ "$cac_host" != "$cac_sni" ]; then
			die "$cac_origin is an IP: set DEFAULT_SNI=$cac_host in .env and restart Caddy (RUNBOOK)"
		fi
	done
	set +f
}

# ANDROID_APP_NAME $1 (optional): the same rule as appName in android/app/build.gradle.kts.
check_android_app_name() {
	[ -z "$1" ] && return 0
	printf '%s\n' "$1" | LC_ALL=C.UTF-8 grep -Eqx "[[:alnum:]][[:alnum:] .'-]{0,29}" ||
		die "ANDROID_APP_NAME: 1 to 30 letters, digits, spaces, . - or ', starting with a letter or digit (got '$1')"
}

# Whether file $1 is a PNG of exactly $2 x $2 pixels.
is_square_png() { file -bL "$1" 2>/dev/null | grep -Eq "^PNG image data, $2 x $2,"; }

# ANDROID_ICON_DIR $1 (optional): foreground.png (432x432, Android 8+) and legacy.png (192x192,
# Android 7) replace the default icon (RUNBOOK, "Club name and icon").
check_android_icon_dir() {
	[ -z "$1" ] && return 0
	command -v file >/dev/null || die "ANDROID_ICON_DIR needs the file command: sudo apt-get install file"
	case $1 in /*) ;; *) die "ANDROID_ICON_DIR must be a full path starting with / (got '$1')" ;; esac
	[ -d "$1" ] || die "ANDROID_ICON_DIR $1 is not a folder"
	is_square_png "$1/foreground.png" 432 || die "ANDROID_ICON_DIR: $1/foreground.png must be a 432x432 PNG"
	is_square_png "$1/legacy.png" 192 || die "ANDROID_ICON_DIR: $1/legacy.png must be a 192x192 PNG"
}
