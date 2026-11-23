# 0010. Android app for club tablets

- Status: Accepted (merged in #34)
- Date: 2026-11-16 (owner request)
- Amends: [ADR 0008](0008-deploy-details.md), the "Each staff device trusts Caddy's root
  certificate once" bullet; [ADR 0003](0003-hosting.md), "Staff use a browser on phones/tablets"
- Amended by: [ADR 0028](0028-database-account-and-hardening.md) (the APK trusts the club root only)

## Context
- Android Chrome blocks Caddy's internal certificate with no "Proceed", even with the root
  installed (PROGRESS.md). The roadmap's fix is Let's Encrypt via DNS-01, which needs the club's
  own domain, a DNS host API token and internet access for renewals.
- Installing the root system-wide lets whoever holds the `caddy_data` key intercept any HTTPS
  traffic on that device (RUNBOOK), so it is a poor fit for staff personal phones.
- Tablets are shared (ADR 0007). Staff should stay on the booking screen, not browse or change
  settings.
- The app is server-rendered with server actions (ADR 0002, ADR 0006). It has no separate API,
  so a native client would mean a second front end and a new API.

## Decision
- **A thin Android wrapper app**: one full-screen WebView that opens `APP_URL`. The box keeps
  serving the whole app, so app releases (`vX.Y.Z`) need no new APK.
- **Certificate**: the APK bundles the club's Caddy root certificate (public part only) and trusts
  it through Android's network security config, next to the system roots. Nothing is installed on
  the device, and the root is trusted by this app only.
- **Locked to the box**: the WebView loads only `APP_URL` and `TRUSTED_ORIGINS` (ADR 0008). Any
  other link is refused. No JavaScript bridge to native code, no file access, no mixed content.
- **Tablet behaviour**: keeps the screen on; shows a "Box not reachable, retry" screen when the
  box can't be reached instead of a WebView error.
- **Kiosk**: Android screen pinning with the device PIN, set up once per tablet (RUNBOOK). The app
  does not use lock task mode (it needs device-owner provisioning). It can be added later.
- **Built per club, on the box**: the URL and root certificate differ for every install, so the
  repository ships the Android project but no APK.
  - `scripts/build-android.sh` builds the APK in a Docker container with the Android SDK. It reads
    the root from the running `caddy_data` volume and `APP_URL` / `TRUSTED_ORIGINS` from `.env`.
  - The signing key is created on first build and stays on the box, outside the checkout. It is
    backed up with the database (Backups item). Losing it means uninstalling and reinstalling the
    app on every tablet.
- **Install**: the APK is copied to each tablet and installed directly ("Install unknown apps"),
  with no Play Store. Minimum Android 7.0 (API 24), the first with network security config.
- **Browsers still work**: iOS devices and desktops keep using a browser with the root trusted
  (ADR 0008). Let's Encrypt stays on the roadmap, deferred, for staff personal phones and for
  remote access.

## Alternatives considered
- **Let's Encrypt via DNS-01** (roadmap): fixes every browser, but needs a domain, a DNS API token
  on the box and internet for renewals. Kept for later.
- **Installable web app (PWA) or Trusted Web Activity**: both run in Chrome and need a certificate
  Chrome already trusts, so they depend on Let's Encrypt.
- **Native Android app**: a second front end and a new API for every feature. Too much for a
  handful of tablets.
- **Prebuilt APK from CI or GitHub Releases**: one APK can't carry every club's root, and it
  would need either a root-download step on first launch (trust on first use) or trusting all
  user-installed roots.
- **Lock task mode**: stronger kiosk, but each tablet needs a factory reset and device-owner
  setup.

## Consequences
- Club tablets no longer need the root installed system-wide, which removes the interception risk
  on those devices.
- A new box, or a new `caddy_data` volume, means a new root: rebuild the APK and reinstall it on
  every tablet (ADR 0008 already says to move `caddy_data` with the database).
- The signing key becomes something to protect and back up.
- The repository gains a small Android (Kotlin, Gradle) project and a build script. CI builds it
  with a throwaway certificate and key to catch breakage.
- Changes to the wrapper itself (new Android permissions, kiosk mode) need a new APK on every
  tablet. App features don't.
