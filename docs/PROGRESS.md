# Progress

> Rewritten (not appended) at every `/wrap-up`. Keep under 40 lines. Git history keeps old versions.

## Current state
- `v0.3.2` is deployed on the box (includes `v0.3.1`: #28 compact map header; #29 date controls
  on one line; #31 instant calendar and "Go to today"). ADRs 0010 (#34) and 0011 (#35) accepted.

## Done this session
- #29, #31 (`src/components/date-jump.tsx`); e2e specs share one sign-in (`e2e/admin.setup.ts`).
- CHANGELOG split into one section per release, v0.1.0 … v0.3.2.

## Next up
1. Backups: nightly encrypted dumps to USB + OneDrive, before the first real season. Ask the
   owner: OneDrive approval from whoever runs Microsoft 365, and a USB drive left in the box.
2. Quick book: name, phone, umbrellas, sunbeds → suggested spots, one-tap confirm.
3. Android app for club tablets (ADR 0010; Tailscale fallback, ADR 0011). Replaces the
   trusted certificate as the fix for Android Chrome; Let's Encrypt is deferred.

## Open questions
- ADR 0010: which Android versions the club tablets run (minimum is 7.0), and whether staff
  personal phones need the app or Chrome.
- ADR 0011: Tailscale terms for company use; who gets remote access (owner, which staff).
- GDPR: retention period for customer name/phone/notes, and a redaction path (needs an ADR).
- No AuditLog yet (ADR 0004): bookings and pass changes write no entry. Needed before payments.
- Day and multi-day bookings can still be created for past days (pre-existing; passes can't).
- No rate limit on booking actions; spots aren't checked against the area.
- Umbrellas with past bookings can never be removed (FK restrict): add "retire" before next season.
- Venue name accepts control characters; setup numbers accept `true`/`1e1` (bounds still hold).
- The map opens on the first space: remember each tablet's last space (cookie)?
- Dev-only 'uncached data' overlay on every page (also /admin/staff, predates this work).
- Session length on shared tablets: 12 h absolute, or end of day (Europe/Rome)?
- `formatEur` takes euros: switch to cents before the Prices item?
- Ruleset `rulset1` requires `docker` only: add `checks`, `e2e` and `deploy-scripts`.
- RUNBOOK firewall example says `192.168.1.0/24`; the box is on `192.168.0.0/24`.
- E2E uses exactly 5 sign-ins (the per-minute limit): a CI retry of a login test can hit it.

## Known issues
- Sessions can't pull Docker images or push tags (HTTP 403): Docker/e2e run in CI, tags on GitHub.
- Next.js `next dev` re-creates AGENTS.md; it is committed to keep the tree clean.
