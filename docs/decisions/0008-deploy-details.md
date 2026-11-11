# 0008. Deploy details: HTTPS, client IP, images and rollback

- Status: Accepted (on merge of this PR)
- Date: 2026-11-11

## Context
- ADR 0003 puts the stack on one club box behind Caddy. It leaves the HTTPS choice open until the
  Deploy item, and the box runs Docker Engine in WSL2 now and maybe native Linux later.
- ADR 0007 rate-limits sign-in per client IP. Better Auth reads the leftmost `X-Forwarded-For`
  value by default, and the client controls that value.
- Sessions can't push tags or images to a registry. Staff data never leaves the box.

## Decision
- **HTTPS**: Caddy `tls internal` serves `SITE_ADDRESS`, for example
  `stabilimento.local, 192.168.1.10`.
  - Each staff device trusts Caddy's root certificate once (RUNBOOK).
  - It works with no internet connection, and tablets don't need Tailscale.
  - A Tailscale certificate can be added later as an extra site block.
- **Client IP**: Caddy overwrites `X-Real-IP` with the peer address. Better Auth reads only that
  header (`ipAddressHeaders: ["x-real-ip"]`).
  - The app container publishes no host port, so Caddy is the only way in.
- **Origins**: `APP_URL` is the main origin. `TRUSTED_ORIGINS` (comma-separated) adds the other
  addresses staff use, such as the IP or the Tailscale name.
- **Images**: `scripts/update.sh vX.Y.Z` checks out the tag and builds `stabilimento-app:vX.Y.Z` and
  `stabilimento-migrate:vX.Y.Z` on the box. The images of the last 3 releases are kept. No registry.
- **Update order**: lock → refuse on a dirty tree, a bad tag or a missing `.env` → pre-update
  `pg_dump` → build → stop app → migrate → start → health check → record the release.
  - The app is stopped during migrations, so old code never runs against a new schema.
- **Rollback**: `scripts/rollback.sh` drops and re-creates the database, restores the last
  pre-update dump, and starts the previous release's image.
  - Data entered after the update is lost. The script shows the dump time and asks for
    confirmation.
- **Scripts** are POSIX `sh`, checked with shellcheck, and identical on WSL2 and native Linux.

## Alternatives considered
- **Tailscale certificate only**: renewal needs internet, and every tablet needs Tailscale.
- **`trustedProxies` + `X-Forwarded-For`**: works too, but needs Caddy's container IP, which is not
  fixed. One overwritten header is simpler.
- **Registry (GHCR) images**: needs tag pushes from CI and a login on the box. Not worth it for
  one box.
- **`migrate down` rollback**: keeps new data, but depends on every down migration being correct
  and lossless. The dump restore is always available. A keep-data mode stays an open question.

## Consequences
- The `caddy_data` volume holds the root key. It must be moved along with the database when the
  box is replaced, or every device has to trust a new root.
- A failed update leaves the app stopped, and the script prints the rollback command.
- If WSL2 networking hides LAN source IPs, all devices share one rate-limit bucket. The RUNBOOK
  checks Caddy's access log for this.
