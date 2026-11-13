# Progress

> Rewritten (not appended) at every `/wrap-up`. Keep under 40 lines. Git history keeps old versions.

## Current state
- `v0.2.1` is tagged and deployed on the club box (Windows + WSL2). `main` = PR #21.
- In v0.2.1: #13 beach map, #14 bookings, #15 editable beach settings, #16 several beach spaces,
  #17 update fix (EACCES at the migrate step). Roadmap Milestone 1 items 1 and 2 are ticked.
- Merged, not in a tagged release: #12 `setup-wsl.sh` without `sg` (Ubuntu 24.04 WSL), #19 tracker,
  #21 CI skips the heavy jobs on docs-only pull requests (pushes to `main` still run everything).

## Done this session
- Added the `tracker` agent (PR #19), wired into `/start` and `/wrap-up`. Merged #12, #18, #20, #21.
- Checked on the box (#12 wrap-up): WSL2 mirrored networking keeps LAN source IPs.

## Next up
1. Quick book: name, phone, umbrellas, sunbeds → suggested spots, one-tap confirm.
2. Seasons and season passes with released days.
3. Backups (USB + OneDrive) before the first real season. Share the lock with `update.sh`.
4. Trusted certificate: Android Chrome blocks the internal-CA cert with no "Proceed". Let's Encrypt
   via DNS-01 on the club's domain (new ADR amending ADR 0008). Ask the owner: domain, DNS host.

## Open questions
- GDPR: retention period for customer name/phone/notes, and a redaction path (needs an ADR).
- AuditLog table (ADR 0004 mentions it) is not built yet: create and cancel write no audit entry.
- No rate limit on booking actions; spots aren't checked against the area.
- Umbrellas with past bookings can never be removed (FK restrict): add "retire" before next season.
- Venue name accepts control characters; setup numbers accept `true`/`1e1` (bounds still hold).
- The map opens on the first space: remember each tablet's last space (cookie)?
- Dev-only 'uncached data' overlay on every page (also /admin/staff, predates this work).
- Session length on shared tablets: 12 h absolute, or end of day (Europe/Rome)?
- `formatEur` takes euros: switch to cents before the Prices item?
- Ruleset `rulset1` requires `docker` only: add `checks`, `e2e` and `deploy-scripts`.
- RUNBOOK firewall example says `192.168.1.0/24`; the box is on `192.168.0.0/24`.
- CHANGELOG has everything under "Unreleased": split into v0.1.0 … v0.2.1; add the #12 fix.

## Known issues
- Sessions can't pull Docker images or push tags (HTTP 403): Docker/e2e run in CI, tags on GitHub.
- Next.js `next dev` re-creates AGENTS.md; it is committed to keep the tree clean.
