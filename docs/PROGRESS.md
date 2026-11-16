# Progress

> Rewritten (not appended) at every `/wrap-up`. Keep under 40 lines. Git history keeps old versions.

## Current state
- `v0.3.2` is deployed on the box. PR #37 (`feat/quick-book`) is open with CI green; it
  supersedes the docs-only PR #36, which can be closed. Nothing is unreleased on `main` yet.

## Done this session
- Quick book (#37, ADR 0012), passes included; day/multi-day bookings now refuse past dates.

## Next up
1. Backups: nightly encrypted dumps to USB + OneDrive, before the first real season. Ask the
   owner: OneDrive approval from whoever runs Microsoft 365, and a USB drive left in the box.
2. Move a booking to another spot or dates (next Milestone 1 item).
3. Android app for club tablets (ADR 0010; Tailscale fallback, ADR 0011).

## Open questions
- ADR 0010: which Android versions the club tablets run (minimum is 7.0), and whether staff
  personal phones need the app or Chrome.
- ADR 0011: Tailscale terms for company use; who gets remote access (owner, which staff).
- GDPR: retention period for customer name/phone/notes, and a redaction path (needs an ADR).
- No AuditLog yet (ADR 0004): bookings and pass changes write no entry. Needed before payments.
- No rate limit on booking or suggest actions; spots aren't checked against the area.
- Quick book: "Another suggestion" resets the booking form (typed notes, map edits). A split
  never starts in a line that alone has enough umbrellas (101 + 201 isn't offered over 101 + 103).
- Umbrellas with past bookings can never be removed (FK restrict): add "retire" before next season.
- Venue name accepts control characters; setup numbers accept `true`/`1e1` (bounds still hold).
- The map opens on the first space: remember each tablet's last space (cookie)?
- Session length on shared tablets: 12 h absolute, or end of day (Europe/Rome)?
- `formatEur` takes euros: switch to cents before the Prices item?
- Ruleset `rulset1` requires `docker` only: add `checks`, `e2e` and `deploy-scripts`.
- RUNBOOK firewall example says `192.168.1.0/24`; the box is on `192.168.0.0/24`.
- E2E uses exactly 5 sign-ins (the per-minute limit): a CI retry of a login test can hit it.

## Known issues
- Sessions can't pull Docker images or push tags (HTTP 403): Docker/e2e run in CI, tags on GitHub.
- Next.js `next dev` re-creates AGENTS.md; it is committed to keep the tree clean.
- Dev-only 'uncached data' overlay on every page (also /admin/staff).
