# Plan: Android app for club tablets

**Goal**: A per-club WebView wrapper APK, built on the box by `scripts/build-android.sh`, that
trusts the bundled Caddy root, stays on the box's origins, and falls back to `REMOTE_URL`
([ADR 0010](../decisions/0010-android-app.md), [ADR 0011](../decisions/0011-tailscale-remote-access.md)).

## Acceptance criteria
- **Build on the box**: Given a running install and `.env` with `APP_URL`, `TRUSTED_ORIGINS`,
  optional `REMOTE_URL`. When `scripts/build-android.sh` runs. Then a signed APK (minSdk 24) is
  written outside the checkout, the root's SHA-256 fingerprint and the signer fingerprint are
  printed, and `git status --porcelain` is empty.
- **Signing key**: first run creates the keystore + password file in `~/secrets` (mode 600);
  later runs reuse it (same signer digest) and produce a higher versionCode, so the APK installs
  over the previous one.
- **Refusals before any Docker build**: missing `.env`; missing root in `caddy_data` ("run
  update.sh first"); `APP_URL`/`TRUSTED_ORIGINS`/`REMOTE_URL` not an exact `https://host[:port]`
  origin (no path, no trailing `/`, no `*`); `REMOTE_URL` not in `TRUSTED_ORIGINS`; an origin
  host not in `SITE_ADDRESS` (Caddy would have no certificate for it).
- **Trust**: the APK trusts system roots + the bundled club root only (network security config);
  a cert from another CA fails; an SSL error is never proceeded.
- **Locked to the box**: main-frame navigation to any origin outside {APP_URL, TRUSTED_ORIGINS,
  REMOTE_URL} is refused; sub-resource requests to other origins are blocked. Not
  `http:`, `file:`, `content:`, `intent:`, `javascript:` or `data:` navigation.
- **WebView hardening**: no `addJavascriptInterface`; file/content access off; mixed content
  `NEVER_ALLOW`; no multiple windows, downloads, file chooser or permission grants; web
  debugging off; `allowBackup=false`; only the `INTERNET` permission.
- **Fallback (ADR 0011)**: at launch and after a failed main-frame load, `GET APP_URL/health`
  (3 s timeout), then `REMOTE_URL/health`; first HTTP 200 wins and is loaded at `/`; it stays
  on that origin until a load fails, then probing restarts from `APP_URL`.
- **Retry screen**: if neither answers, a native "Box not reachable / Retry" screen in the
  device language (Italian, otherwise English); Retry re-probes.
- **Tablet**: screen stays on; full screen; Back goes back in WebView history.

## Files to create or change
- `android/settings.gradle.kts`, `android/build.gradle.kts`, `android/gradle.properties`: project,
  pinned plugin versions, `google()` + `mavenCentral()` only.
- `android/app/build.gradle.kts`: minSdk 24; reads Gradle properties (`appUrl`,
  `trustedOrigins`, `remoteUrl`, `versionCode`, `versionName`) into BuildConfig; fails unless
  they are https origins and `res/raw/club_root.crt` exists (the script copies the root into its
  temporary copy of `android/`). Release unsigned; signing done by `apksigner`.
- `android/app/src/main/AndroidManifest.xml`: one activity, `INTERNET` only, NSC, no cleartext.
- `android/app/src/main/res/xml/network_security_config.xml`: system + `@raw/club_root` anchors.
- `android/app/src/main/res/layout/activity_main.xml`: WebView + retry view.
- `android/app/src/main/res/values/strings.xml`, `values-it/strings.xml`: retry screen texts.
- `android/app/src/main/kotlin/.../MainActivity.kt`: WebView setup, keep-screen-on, back key.
- `.../BoxWebViewClient.kt`: allow-list checks, main-frame error / 502-504 → re-probe.
- `.../OriginPolicy.kt`: parse + exact-origin match (`java.net.URI`, no Android types).
- `.../BoxSelector.kt`: candidate order and "stay until failure" state; probe injected.
- `.../HealthProbe.kt`: `HttpURLConnection`, 3 s connect/read, no redirects, 200 only.
- `android/app/src/test/kotlin/...`: JVM tests below (JUnit 4 is the only test dependency).
- `android/Dockerfile`: `gradle:8.14.3-jdk17` base (pins Gradle; no wrapper committed), Android
  cmdline-tools (SHA-256 pinned) + platform 35 + build-tools 35.0.0. Runs as the calling user.
- `scripts/lib/android.sh`: origin validation and SITE_ADDRESS host check (sourced, POSIX).
- `scripts/build-android.sh`: see Build flow.
- `.env.example`: commented `REMOTE_URL=` (Tailscale `https://` name, must be in TRUSTED_ORIGINS).
- `.gitignore`: `android/.gradle/`, `android/local.properties`, `*.apk`, `*.p12`, `*.pass`.
- `.github/workflows/ci.yml`: new `android` job.
- `docs/RUNBOOK.md`, `docs/ARCHITECTURE.md`, `CLAUDE.md` (Commands), `docs/PROGRESS.md`.

## Build flow (`scripts/build-android.sh`)
1. Source `lib/common.sh` (umask 077, `log`/`die`, `env_value`, `require_env_file`) and
   `lib/android.sh`; validate `.env` values (refusals above).
2. Copy the public root out of the volume, read-only, to a temp file:
   `docker run --rm -v stabilimento_caddy_data:/d:ro caddy:2.10-alpine cat
   /d/caddy/pki/authorities/local/root.crt`. Check it with `openssl x509`; print its fingerprint.
   The CA key volume is never mounted into the SDK container.
3. Build the `stabilimento-android-build:<Dockerfile hash>` image if missing.
4. First run: `keytool` in the container creates `~/secrets/stabilimento-android.p12` (RSA 4096,
   ~30 years) + random `stabilimento-android.pass`; passwords passed as `file:`, never argv.
5. Run the container: `android/` mounted read-only and copied to `/work`; root, keys and output
   dir mounted; Gradle cache in `~/.cache/stabilimento-android` (owned by the user). It runs `gradle test
   assembleRelease`, then `zipalign` + `apksigner sign`/`verify`.
6. Output `~/stabilimento-android/stabilimento-<current release>-<UTC yyyymmddHHMMSS>.apk`;
   versionCode = UTC seconds since 2026-01-01 (two CI builds a few seconds apart still grow).
   Print the path and signer SHA-256.

## JVM tests (`gradle test`)
- **OriginPolicy**: valid APP_URL; host lowercased; `:443` equals the default port; http,
  path/query/fragment, userinfo, `*` and trailing `/` rejected in config; empty TRUSTED_ORIGINS
  and null REMOTE_URL ok; allowed: any path on listed origins, IPv4 origin; refused:
  `stabilimento.local.evil.com`, `evilstabilimento.local`, other port, same host on http,
  `https://stabilimento.local@evil.com`, `javascript:`/`data:`/`file:`/`intent:`/`about:blank`.
- **BoxSelector** (fake probe): APP up → APP and REMOTE not probed; APP down, REMOTE up →
  REMOTE; both down → none; no REMOTE → APP or none; a probe exception counts as down;
  after selection no re-probe until `onLoadFailed()`, which restarts from APP.
- **HealthProbe** (JDK `com.sun.net.httpserver`): 200 → up; 503 → down; 302 → down (not
  followed); response after 4 s → down within ~3 s; connection refused → down; URL is
  `origin + "/health"`.

## CI job `android` (needs `changes`, same `if` as the others)
- Throwaway root via `openssl req -x509`, placed in volume `stabilimento_caddy_data` at
  `caddy/pki/authorities/local/root.crt`; `.env` with APP_URL, an IP origin and a fake
  `*.ts.net` REMOTE_URL (all in SITE_ADDRESS); key and APK directories in `$RUNNER_TEMP`.
- Failure cases first (fast, no Docker build): http APP_URL, REMOTE_URL not in TRUSTED_ORIGINS,
  host not in SITE_ADDRESS → non-zero exit.
- Build twice. Assert: `apksigner verify`; same signer digest both times; versionCode grew;
  `aapt2 dump badging` shows minSdk 24 and only `INTERNET`; bundled raw cert equals the root
  (`cmp`); clean git tree.
- Guard: `! grep -rE 'addJavascriptInterface|setAllowFileAccess\(true' android/`.
- Shellcheck already covers `scripts/*.sh scripts/lib/*.sh`. No bats exists; this job is the
  script test.

## RUNBOOK additions (new section "Android app for club tablets")
- Build: `scripts/build-android.sh` (needs internet on the box; first build is slow).
- Keystore + password in `~/secrets`: back up encrypted next to `.env` (like `caddy_data`) until
  the Backups item covers it; losing it means uninstall + reinstall on every tablet.
- Install: copy the APK by USB, check the signer fingerprint printed by the script, allow
  "Install unknown apps" for the file manager once, then turn it off again.
- Screen pinning: Settings → Security → App pinning, "Ask for PIN before unpinning".
- Tablets previously given the system-wide root: remove it (the app doesn't need it).
- Rebuild + install over the old one after a new box / new `caddy_data`, a changed
  `APP_URL`/`TRUSTED_ORIGINS`/`REMOTE_URL`, or a wrapper change. App releases need no new APK.
- Amend "Trusting the certificate", "State that must survive a machine move" and "Recovery":
  Android tablets use the app; the keystore is part of the state.
- Tailscale box setup and the outside check stay in the Milestone 2 "Remote access" item.

## Risks and edge cases
- **Old WebView**: Android 7 tablets stop at WebView/Chrome 119. Next 16's baseline is lower, but
  test the app on the oldest real tablet early (PROGRESS open question on tablet versions).
- **WebView trust of NSC anchors on API 24**: verify on a device. Never add an
  `onReceivedSslError` proceed path; a failure here needs a new ADR, not a workaround.
- **Dirty checkout breaks `update.sh`**: everything builds in `/work` and `build/` outside
  `src/`; CI asserts a clean tree.
- **Box down during an update**: Caddy returns 502 on page loads; treated as unreachable → retry screen.
- **`.local` not resolving on Android**: APP_URL probe fails and there is no IP fallback (ADR
  0011 fixes the order); keep the router DNS entry (RUNBOOK First install step 5).
- **Probe on the UI thread**: run on a single background executor and post results.
- **Sessions per origin**: switching to REMOTE_URL means signing in again (ADR 0011).
- **Shared tablets**: `allowBackup=false` keeps session cookies out of device backups.
- **Booking logic**: untouched. No double-booking, time zone or migration impact.

## Data / API changes
- None: no schema, migrations or endpoints. Uses existing `/health`. New optional `.env` key
  `REMOTE_URL`, read only by the build script.

## Steps (one commit each, then reviewer + security agents)
1. `chore(android):` Gradle project skeleton, manifest, `.gitignore` entries.
2. `test(android):` failing OriginPolicy, BoxSelector, HealthProbe tests.
3. `feat(android):` OriginPolicy, BoxSelector, HealthProbe.
4. `feat(android):` MainActivity, WebViewClient, NSC, retry screen (it/en), keep-screen-on.
5. `feat(deploy):` `android/Dockerfile`, `scripts/lib/android.sh`, `scripts/build-android.sh`,
   `.env.example`.
6. `ci:` `android` job.
7. `docs:` RUNBOOK, ARCHITECTURE, CLAUDE.md, PROGRESS.

## Open questions
- Toolchain: pinned to a well-known set (Android Gradle plugin 8.7.3, Kotlin 2.1.0, Gradle
  8.14.3, SDK 35) because sessions can't build Android. Moving to plugin 9.x (built-in Kotlin,
  Gradle 9) is a later, CI-verified change.
- Should the retry screen also retry automatically (e.g. every 30 s) for unattended tablets?
  Not in the ADR.
- Is treating Caddy 502/503/504 page loads as "not reachable" OK? It's my reading of ADR 0010.
- applicationId (proposed `app.stabilimento.tablet`); changing it later forces reinstall.
- Copy the APK to Windows Downloads like `setup-wsl.sh` does for the root? That means moving
  `windows_profile` into `scripts/lib/`.
- Should the shared Docker image be cached in CI (build time)?
