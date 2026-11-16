#!/bin/sh
# Builds the Android app for club tablets on the box (ADR 0010, ADR 0011): a signed APK that
# opens APP_URL (falling back to REMOTE_URL) and trusts the club's Caddy root.
# Usage: scripts/build-android.sh   (needs internet on the first run; see docs/RUNBOOK.md)
# Writes nothing into the checkout. The signing key stays in ANDROID_KEY_DIR (~/secrets).
set -eu
DEPLOY_ROOT="${DEPLOY_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
# shellcheck source=scripts/lib/common.sh
. "$(dirname "$0")/lib/common.sh"
# shellcheck source=scripts/lib/android.sh
. "$(dirname "$0")/lib/android.sh"

CADDY_VOLUME=${CADDY_VOLUME:-stabilimento_caddy_data}
CADDY_IMAGE=caddy:2.10-alpine
ROOT_PATH=/d/caddy/pki/authorities/local/root.crt
KEY_DIR=${ANDROID_KEY_DIR:-$HOME/secrets}
OUT_DIR=${ANDROID_OUT_DIR:-$HOME/stabilimento-android}
CACHE_DIR=${ANDROID_CACHE_DIR:-$HOME/.cache/stabilimento-android}
KEYSTORE=stabilimento-android.p12
KEY_PASS=stabilimento-android.pass
KEY_ALIAS=stabilimento
# versionCode: seconds since 2026-01-01 UTC, so every rebuild installs over the previous APK.
VERSION_EPOCH=1767225600

require_env_file
app_url=$(env_value APP_URL)
trusted=$(env_value TRUSTED_ORIGINS)
remote=$(env_value REMOTE_URL)
check_android_config "$app_url" "$trusted" "$remote" "$(env_value SITE_ADDRESS)"
command -v docker >/dev/null || die "docker not found"
command -v openssl >/dev/null || die "openssl not found"

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"; cleanup' EXIT

# Only the public root leaves the volume; the CA key is never mounted into the build.
docker run --rm -v "$CADDY_VOLUME:/d:ro" "$CADDY_IMAGE" cat "$ROOT_PATH" >"$WORK/root.crt" 2>/dev/null ||
	die "no Caddy root certificate in volume $CADDY_VOLUME: run scripts/update.sh first"
openssl x509 -noout -in "$WORK/root.crt" 2>/dev/null || die "the Caddy root in $CADDY_VOLUME is not a certificate"
root_fingerprint=$(openssl x509 -noout -fingerprint -sha256 -in "$WORK/root.crt" | sed 's/^.*=//')
log "club root SHA-256: $root_fingerprint"

image="stabilimento-android-build:$(openssl dgst -sha256 -r "$DEPLOY_ROOT/android/Dockerfile" | cut -c1-12)"
if ! docker image inspect "$image" >/dev/null 2>&1; then
	log "building $image (first run: downloads the Android SDK)"
	docker build --quiet -t "$image" - <"$DEPLOY_ROOT/android/Dockerfile" >/dev/null
fi

install -d -m 700 "$KEY_DIR"
mkdir -p "$OUT_DIR" "$CACHE_DIR/gradle"

# The build runs as the calling user, so everything it writes stays owned by them.
in_build_image() {
	docker run --rm --user "$(id -u):$(id -g)" \
		-e HOME=/work/.home -e JAVA_TOOL_OPTIONS=-Duser.home=/work/.home \
		-e ANDROID_USER_HOME=/work/.home/.android -e GRADLE_USER_HOME=/cache/gradle \
		-v "$WORK:/work" -v "$CACHE_DIR:/cache" "$@"
}

if [ ! -e "$KEY_DIR/$KEYSTORE" ] && [ ! -e "$KEY_DIR/$KEY_PASS" ]; then
	log "creating the signing key in $KEY_DIR: back it up with .env (RUNBOOK)"
	openssl rand -hex 32 | tr -d '\n' >"$KEY_DIR/$KEY_PASS"
	in_build_image -v "$KEY_DIR:/keys" "$image" keytool -genkeypair -noprompt \
		-keystore "/keys/$KEYSTORE" -storetype PKCS12 -storepass:file "/keys/$KEY_PASS" \
		-alias "$KEY_ALIAS" -keyalg RSA -keysize 4096 -validity 10950 \
		-dname "CN=Stabilimento tablet app" 2>/dev/null
fi
[ -f "$KEY_DIR/$KEYSTORE" ] && [ -f "$KEY_DIR/$KEY_PASS" ] ||
	die "$KEY_DIR has only one of $KEYSTORE and $KEY_PASS: restore both from the backup"

cp -R "$DEPLOY_ROOT/android" "$WORK/android"
mkdir -p "$WORK/android/app/src/main/res/raw"
cp "$WORK/root.crt" "$WORK/android/app/src/main/res/raw/club_root.crt"

version_name=$(read_state current)
printf '%s\n' "$version_name" | grep -Eqx 'v[0-9]+\.[0-9]+\.[0-9]+' || version_name=dev
now=$(date -u +%s)
version_code=$((now - VERSION_EPOCH))
apk="stabilimento-$version_name-$(date -u +%Y%m%d%H%M%S).apk"

log "building $apk"
# shellcheck disable=SC2016 # expanded by the shell inside the container
in_build_image -v "$KEY_DIR:/keys:ro" -v "$OUT_DIR:/out" -w /work/android \
	-e APP_URL="$app_url" -e TRUSTED_ORIGINS="$trusted" -e REMOTE_URL="$remote" \
	-e VERSION_CODE="$version_code" -e VERSION_NAME="$version_name" -e APK="$apk" \
	-e KEYSTORE="/keys/$KEYSTORE" -e KEY_PASS="/keys/$KEY_PASS" -e KEY_ALIAS="$KEY_ALIAS" \
	"$image" sh -euc '
		gradle --no-daemon --quiet \
			-PappUrl="$APP_URL" -PtrustedOrigins="$TRUSTED_ORIGINS" -PremoteUrl="$REMOTE_URL" \
			-PversionCode="$VERSION_CODE" -PversionName="$VERSION_NAME" \
			test assembleRelease
		zipalign -p -f 4 app/build/outputs/apk/release/app-release-unsigned.apk /work/aligned.apk
		apksigner sign --ks "$KEYSTORE" --ks-type PKCS12 --ks-key-alias "$KEY_ALIAS" \
			--ks-pass "file:$KEY_PASS" --key-pass "file:$KEY_PASS" --out "/out/$APK" /work/aligned.apk
		apksigner verify --print-certs "/out/$APK" | sed -n "s/^Signer #1 certificate SHA-256 digest: //p" >/work/signer
	'

log "APK: $OUT_DIR/$apk (version $version_name, code $version_code)"
log "signer SHA-256: $(cat "$WORK/signer")"
log "check both fingerprints before installing on a tablet (RUNBOOK)"
