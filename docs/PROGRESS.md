# Progress
> Rewritten (not appended) at every `/wrap-up`. Keep under 40 lines. Git history keeps old versions.

## Current state
- `v0.9.0` released and deployed: day counts, search (#53, ADR 0016), theme (#54, ADR 0017).

## Done this session
- Theme toggle (#54); release docs for v0.9.0 (changelog, roadmap, architecture). 916 tests pass.

## Next up
1. Post-deploy check on the box: search, day counts, Theme → Scuro on a tablet and a phone.
2. Live map: changes show on every device within seconds.
3. Backups: nightly encrypted pg_dump to USB + OneDrive (owner: M365 approval, USB in the box).

## Open questions
- Search: rate limit (000–999 lists all customers)? Mask phones in results? `no-store` for it;
  `unaccent` names; no e2e for restoring a no-show from search (needs a pre-11:00 booking).
- Check-in: no e2e for the no-show tile or on `phone`; two no-shows on one umbrella/day show as
  one. Owner to decide: check-in for yesterday, partial restore, one-day hold, admin 11:00 edit.
- Moves: change the umbrella count, a pass's first day or a started booking's end (refused now)?
- Phones: sheet for portrait tablets (768–1023px)? Activity folded on phones (sheet covers Undo)?
- Android: follow the tablet's dark setting (DayNight)? Tablet versions (min 7.0;
  `interactive-widget`?). Auto-retry? `FLAG_SECURE`? ADR 0011: Tailscale terms for company use;
  who gets remote access (owner, which staff).
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
