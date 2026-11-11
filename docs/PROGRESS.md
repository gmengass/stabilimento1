# Progress

> Rewritten (not appended) at the end of every session with `/wrap-up`. Keep under 40 lines.
> Git history keeps the old versions.

## Current state
- v0.1.1 is deployed. It had only login and staff accounts: the booking features were never built.
- PR #13 `feat/beach-map`: admin beach setup (`/admin/beach`) and the beach map per date. CI green.
- PR #14 `feat/bookings` (on top of #13): create and cancel day / multi-day bookings from the map,
  SpotDay rows with a partial unique index (ADR 0004). Reviewer and security agents run, fixes in.
- 413 tests pass.

## Done this session
- Roadmap Milestone 1 rewritten to match the brief (it was the generic template).
- Map: sea at the top, line 1 nearest, names on booked umbrellas, tap to book or open a booking.
- Bookings: clashes listed by umbrella and day, concurrency tests (8 at once; crossed spot sets),
  cancel keeps days already used, can't cancel an ended booking.

## Next up
1. Merge #13, then #14. Tag `v0.2.0` on GitHub and run `scripts/update.sh v0.2.0` on the box.
   Then an admin opens "Impostazione spiaggia" once to create the lines and umbrellas.
2. Quick book: name, phone, umbrellas, sunbeds → suggested spots, one-tap confirm.
3. Seasons and season passes with released days.
4. Backups (USB + OneDrive) before the first real season.

## Open questions
- GDPR: retention period for customer name/phone/notes, and a redaction path (needs an ADR).
- AuditLog table (ADR 0004 mentions it) is not built yet: create and cancel write no audit entry.
- No rate limit on booking actions; spots aren't checked against the area (one area at launch).
- Venue name accepts control characters; setup numbers accept `true`/`1e1` (bounds still hold).
- A partly used booking that is cancelled still shows on its past days (by design, for history).
- Verify on the box: does WSL2 mirrored networking keep LAN source IPs (RUNBOOK check)?
- Session length on shared tablets: 12 h absolute, or end of day (Europe/Rome)?
- `formatEur` takes euros: switch to cents before the Prices item?
- Ruleset `rulset1` requires `docker` only: add `checks`, `e2e` and `deploy-scripts`.

## Known issues
- Sessions can't pull Docker images or push tags (HTTP 403). Docker and e2e are verified in CI.
- Next.js `next dev` re-creates AGENTS.md; it is committed to keep the tree clean.
