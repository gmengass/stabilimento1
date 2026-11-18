# Progress
> Rewritten (not appended) at every `/wrap-up`. Keep under 40 lines. Git history keeps old versions.

## Current state
- `v0.10.0` released and deployed: map header (#56), check-in time (#57, ADR 0018).

## Done this session
- #57 admin "Check-in by" time in Beach settings, merged. #56: lint fix, merged. 938 tests pass.

## Next up
1. On the box: check the map header, "Check-in by", search and Theme on a tablet and a phone.
2. Live map: changes show on every device within seconds.
3. Backups: nightly encrypted pg_dump to USB + OneDrive (owner: M365 approval, USB in the box).

## Open questions
- Search: rate limit (000–999 lists all customers)? Mask phones in results? `no-store` for it;
  `unaccent` names; no e2e for restoring a no-show from search (needs a pre-11:00 booking).
- Check-in time (ADR 0018): an own hold earlier than the venue's wins (use the later?); "not here
  by" shows today's setting, not the one in force. Check-in: no e2e for the no-show tile or on
  `phone`; two no-shows on one umbrella/day show as one. Owner: yesterday, partial, 1-day hold.
- Moves: change the umbrella count, a pass's first day or a started booking's end (refused now)?
- Phones: sheet for portrait tablets (768–1023px)? Activity folded on phones (sheet covers Undo)?
- Android: follow the tablet's dark setting (DayNight)? Tablet versions (min 7.0;
  `interactive-widget`?). Auto-retry? `FLAG_SECURE`? ADR 0011: Tailscale terms; who gets it?
- Android supply chain (Gradle verification, image digests, plugin 9.x). No CSP from Caddy, no
  `Cache-Control: no-store`. `picomatch` ReDoS in dev tooling (`npm audit`): upgrade in a chore.
- GDPR: retention and redaction for customer data, the audit log, check-ins and no-shows (past
  no-shows are a lasting record); FKs are `on delete restrict` (needs an ADR).
- Owner: cancelled bookings' names shown to all staff (initials?); undo "Ripristina"? No rate
  limit on booking, suggest, move, undo or check-in; new bookings don't check spots vs area.
- Minor: "retire" for umbrellas with past bookings (FK restrict); quick book "Another suggestion"
  resets the form, 101 + 201 not offered over 101 + 103; venue name takes control chars, setup
  numbers take `true`/`1e1`; `formatEur` in cents? Map space and session length per tablet?
- Ruleset `rulset1` requires `docker`, `checks`: add `e2e`, `deploy-scripts`, `android`. RUNBOOK
  firewall says `192.168.1.0/24` (box: `.0.0/24`). E2E uses all 5 sign-ins/minute (CI retries).

## Known issues
- Sessions can't pull Docker images, reach Google Maven, get Playwright browsers (e2e: system
  Chrome, `channel: "chrome"`) or push tags.
- Next.js `next dev` re-creates AGENTS.md; it is committed to keep the tree clean.
