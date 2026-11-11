# Progress

> Rewritten (not appended) at the end of every session with `/wrap-up`. Keep under 40 lines.
> Git history keeps the old versions.

## Current state
- `v0.1.1` is released and installed on the club PC (Windows + WSL2, IP 192.168.0.50) with
  `scripts/setup-wsl.sh`. All 3 containers are healthy, and Caddy serves the name and the IP.
- PR #12 is open: `setup-wsl.sh` didn't work without `sg`, which Ubuntu 24.04 WSL lacks. This
  wrap-up is on that branch.

## Done this session
- Deploy item (PR #10, ADR 0008) and the one-command WSL2 setup script (PR #11). Released v0.1.0
  and v0.1.1.
- **Checked on the box:** WSL2 mirrored networking keeps LAN source IPs. Caddy logged the phone's
  own `192.168.0.100`, so each device gets its own login rate limit.
- **Found on the box:** Android Chrome blocks the internal-CA certificate, with no "Proceed"
  button. Installing the root on every device is too fiddly for staff.

## Next up
1. **Trusted certificate with the club's own domain** (a new ADR amending ADR 0008):
   - Use Let's Encrypt via the DNS-01 challenge, with a Caddy build that includes the DNS
     provider's plugin. The name, e.g. `prenotazioni.<club domain>`, points at 192.168.0.50.
   - No inbound ports are needed, and no device setup.
   - Add `ACME_EMAIL` and the DNS API token to `.env`.
   - Update `setup-wsl.sh`/RUNBOOK (router DNS-rebind protection; renewal needs internet ~60 d).
   - **Ask the owner first: the domain name, and who hosts its DNS** (Cloudflare or other).
2. Backups item: nightly encrypted pg_dump to OneDrive (rclone), retention, a restore test, an
   alert. Share the lock with `update.sh`, and include `caddy_data`.
3. Docs PR: rewrite Roadmap Milestone 1 to match the brief and ADR 0004.

## Open questions
- Box firewall rules must use `192.168.0.0/24` (the RUNBOOK example says 192.168.1.0/24).
- In mirrored mode, WSL can't reach the PC's own LAN IP (`hostAddressLoopback`). Document it, or
  make the health check use another route?
- Hardening for later: Caddy→app shared secret, db port dev-only, signed tags, pinned Caddy
  digest, per-username lockout, keep-data rollback.
- Session length on shared tablets: 12 h absolute, or end of day (Europe/Rome)?
- Password policy is length-only, no self-service password change, expired sessions never
  deleted (GDPR). `formatEur` in euros: cents before Prices? VenueSettings: columns or 1:1?
- Ruleset `rulset1` requires `docker` only: add `checks`, `e2e` and `deploy-scripts`.

## Known issues
- Sessions can't pull Docker images, download Playwright browsers or push tags (HTTP 403).
  Docker and e2e are verified in CI, and releases are tagged on GitHub.
- `next dev` re-creates AGENTS.md (committed). Old dev DBs keep 1–120 numbers: re-create them.
