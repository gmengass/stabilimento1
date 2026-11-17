# Progress
> Rewritten (not appended) at every `/wrap-up`. Keep under 40 lines. Git history keeps old versions.

## Current state
- `v0.7.0` released and deployed. `feat/check-in` (check-in + 11:00 hold rule, ADR 0015, migration
  0009) is pushed as PR #50: merge once CI (incl. e2e) is green, then release `v0.8.0`.

## Done this session
- Check-in / remove check-in (today), hold job every minute (`src/instrumentation.ts`), no-shows
  on the map, restore, late-arrival hold, undo, "System" activity entries (`docs/plans/check-in.md`).

## Next up
1. Merge `feat/check-in`, release v0.8.0, deploy; on the box check a no-show appears after 11:00.
2. Try check-in and a move on the oldest tablet and a phone; back up the Android signing key.
3. Backups: nightly encrypted pg_dump to USB + OneDrive (owner: M365 approval, USB in the box).
## Open questions
- Check-in: no e2e for the no-show tile (needs a pre-11:00 booking) or on `phone`; two no-shows on
  one umbrella and day show as one. Not built, owner to decide: check-in for yesterday, partial
  restore, single-day hold override, admin edit of the 11:00 default (seeded by migration).
- Moves: change the umbrella count, a pass's first day or a started booking's end (refused now)?
- Phones: sheet for portrait tablets (768–1023px)? Activity folded on phones (sheet covers Undo)?
- Android: tablet versions (min 7.0; `interactive-widget`?). Auto-retry? `FLAG_SECURE`? ADR 0011:
  Tailscale terms for company use; who gets remote access (owner, which staff).
- Android supply chain (Gradle verification, image digests, plugin 9.x). No CSP from Caddy, no
  `Cache-Control: no-store`. `picomatch` ReDoS in dev tooling (`npm audit`): upgrade in a chore.
- GDPR: retention and redaction for customer data, the audit log, check-ins and no-shows (past
  no-shows are a lasting record); FKs are `on delete restrict` (needs an ADR).
- Owner: cancelled bookings' names shown to all staff (initials?); undo "Ripristina"? No rate
  limit on booking, suggest, move, undo or check-in; new bookings don't check spots vs area.
- Minor: umbrellas with past bookings can't be removed (FK restrict): add "retire" before next
  season. Quick book "Another suggestion" resets the form; 101 + 201 isn't offered over 101 + 103.
  Venue name accepts control chars; setup numbers accept `true`/`1e1`. `formatEur` in cents? Map
  opens on space 1 (remember per tablet?); session length on shared tablets?
- Ruleset `rulset1` requires `docker`, `checks`: add `e2e`, `deploy-scripts`, `android`. RUNBOOK
  firewall says `192.168.1.0/24` (box: `.0.0/24`). E2E uses all 5 sign-ins/minute (CI retries).
## Known issues
- Sessions can't pull Docker images, reach Google Maven, download Playwright browsers or push
  tags (`checkpoint/2026-11-17-check-in` and an older checkpoint tag are local only).
- Next.js `next dev` re-creates AGENTS.md; it is committed to keep the tree clean.
