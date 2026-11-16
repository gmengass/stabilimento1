# 0011. Remote access via Tailscale, and the Android app's fallback address

- Status: Accepted (on merge of this PR)
- Date: 2026-11-16 (owner request)
- Amends: [ADR 0010](0010-android-app.md), "A thin Android wrapper app opens `APP_URL`";
  details the "Remote access (optional): Tailscale" part of [ADR 0003](0003-hosting.md)

## Context
- ADR 0003 lets the owner and chosen staff reach the app from anywhere through Tailscale, with no
  ports opened. It leaves the setup on the box open.
- ADR 0010's Android app opens only `APP_URL`, the box's address on the club network, so it can't
  reach the box from another network.
- Tailscale's Go library (`tsnet`) could be embedded in the APK, but every device would then need
  either an auth key inside the APK or a Tailscale sign-in in our app, plus an in-app proxy and a
  Go toolchain in the Android build.

## Decision
- **On the box**: Tailscale runs inside the WSL2 distro as a systemd service, not on Windows.
  It starts at boot with no one logged in, like Docker, and the steps are the same on native
  Linux. Traffic on `tailscale0` doesn't pass the Windows firewall rules, which stay limited to
  the staff subnet.
- **Tailnet settings**, set by the owner in the Tailscale admin console:
  - The box's key expiry is turned off, so remote access doesn't stop mid-season.
  - MagicDNS on. The box is named `stabilimento`, for example `stabilimento.<tailnet>.ts.net`.
  - The box carries `tag:stabilimento`. Access rules let only the owner and chosen staff reach it,
    on TCP 443 only, and let the box reach no other device.
- **Caddy and the app**: the Tailscale name and `100.x.y.z` address are added to `SITE_ADDRESS`
  and, as `https://` origins, to `TRUSTED_ORIGINS` (ADR 0008). `tls internal` covers them, so the
  root bundled in the APK (ADR 0010) works on both networks. No code change.
- **Devices**: a device that needs remote access runs the official Tailscale app next to ours.
  Shared club tablets that stay on the staff Wi-Fi don't need it.
- **Android app fallback**: the build takes an optional `REMOTE_URL` (the Tailscale name).
  - At launch and after a failed load, the app checks `APP_URL/health` with a short timeout
    (3 s), then `REMOTE_URL/health`, and opens the first that answers. It stays on that address
    until a load fails.
  - Both origins are allowed in the WebView. All other ADR 0010 restrictions still apply.
  - If neither answers, it shows the "Box not reachable, retry" screen.
- **RUNBOOK** gets the setup steps and a check from outside the club: `/health` on the Tailscale
  name, and remote devices showing `100.x` addresses in Caddy's access log.

## Alternatives considered
- **Tailscale embedded in the APK (`tsnet`)**: an auth key in the APK can be extracted and reused
  by anyone who copies it; a per-device sign-in in our app is a new flow to build. Both add an
  in-app proxy, a Go build and Tailscale library updates. Tailscale's own app already does this,
  and better in the background.
- **Tailscale on Windows**: works with mirrored networking, but both firewall rules then need
  `100.64.0.0/10`, and the steps differ on native Linux.
- **Tailscale-issued certificate for the `ts.net` name**: trusted by every browser, but Caddy
  needs access to `tailscaled`'s socket, and turning on certificates publishes the name in public
  certificate logs. Possible later as an extra site block (ADR 0008).
- **Opening a port on the router**: exposes the box to the internet. Rejected in ADR 0003.

## Consequences
- Sessions are per address: switching between the club address and the Tailscale address means
  signing in again.
- Sign-in rate limits count per address, so each remote device shows as its own `100.x` address.
- `REMOTE_URL` is fixed when the APK is built. Renaming the box or the tailnet means a new APK.
- The owner checks Tailscale's terms for company use before setup (ADR 0003).
- Tailscale access pauses during internet outages; the club Wi-Fi keeps working (ADR 0003).
