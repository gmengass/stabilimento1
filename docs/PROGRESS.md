# Progress

> Rewritten (not appended) at every `/wrap-up`. Keep under 40 lines. Git history keeps old versions.

## Current state
- `v0.4.0` (quick book, #37) is tagged, released and deployed on the box.
- PR #39 (activity stream and undo, ADR 0013) is open on `feat/activity-undo`, waiting for CI.

## Done this session
- Activity stream + undo (#39, ADR 0013, migration 0007); reviewer/security findings fixed.

## Next up
1. Merge #39 once CI is green, release `v0.5.0`, deploy (migration 0007 runs on update).
2. Backups: nightly encrypted dumps to USB + OneDrive. Ask the owner for OneDrive approval
   (Microsoft 365 admin) and a USB drive left in the box.
3. Move a booking to another spot or dates (next Milestone 1 item; log it for undo, ADR 0013).

## Open questions
- ADR 0010: which Android versions the club tablets run (minimum is 7.0), and whether staff
  personal phones need the app or Chrome.
- ADR 0011: Tailscale terms for company use; who gets remote access (owner, which staff).
- GDPR: retention for customer data and the audit log, and a redaction path (needs an ADR).
  `audit_log` FKs are `on delete restrict`, so bookings/users can't be deleted once logged.
- Owner: activity shows cancelled bookings' names to all staff (or initials?); Italian undo is
  "Ripristina", since "Annulla" already means cancel a booking. OK?
- No rate limit on booking, suggest or undo actions; spots aren't checked against the area.
- Quick book: "Another suggestion" resets the booking form (typed notes, map edits). A split
  never starts in a line that alone has enough umbrellas (101 + 201 isn't offered over 101 + 103).
- Umbrellas with past bookings can never be removed (FK restrict): add "retire" before next season.
- Venue name accepts control characters; setup numbers accept `true`/`1e1` (bounds still hold).
- The map opens on the first space: remember each tablet's last space (cookie)?
- Session length on shared tablets: 12 h absolute, or end of day (Europe/Rome)?
- `formatEur` takes euros: switch to cents before the Prices item?
- Ruleset `rulset1` requires `docker` and `checks`: add `e2e` and `deploy-scripts`.
- RUNBOOK firewall example says `192.168.1.0/24`; the box is on `192.168.0.0/24`.
- E2E uses exactly 5 sign-ins (the per-minute limit): a CI retry of a login test can hit it.

## Known issues
- Sessions can't pull Docker images or push tags (HTTP 403): Docker/e2e run in CI, tags on GitHub.
- Next.js `next dev` re-creates AGENTS.md; it is committed to keep the tree clean.
- Dev-only 'uncached data' overlay on every page (also /admin/staff).
