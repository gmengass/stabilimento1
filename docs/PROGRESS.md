# Progress
> Rewritten (not appended) at every `/wrap-up`. Keep under 40 lines. Git history keeps old versions.

## Current state
- `v0.12.0` released and deployed (stock of lettini/sdraie, #63). `v0.11.0`: live map, deckchairs.

## Done this session
- Stock of lettini/sdraie (ADR 0021, migration 0012): Beach settings, day counts, warn + "anyway"
  on book/pass/date move, overrides logged. 1070 tests, 46 e2e; review approved, security pass.

## Next up
1. Owner: enter the lettini/sdraie stock in Beach settings. Delete branch `feat/deckchairs`.
2. Backups: nightly encrypted pg_dump to USB + OneDrive (owner: M365 approval, USB in the box).
3. Prices, payments at the desk, daily cash-up (Milestone 2).

## Open questions
- Deckchairs: edit on a booking (audited, undo)? "+N" on tiles? Stock (ADR 0021): no warning on
  undo/restore/lowering it; date moves warn on all days, not only added; per space? Races pass.
- Search: rate limit (000–999 lists all)? Mask phones? `no-store`; `unaccent`; e2e restore. ADR
  0018: an earlier own hold wins (later?); "not here by" shows today's setting. No e2e for the
  no-show tile or on `phone`; two no-shows on one umbrella/day show as one. Owner: yesterday,
  partial, 1-day hold. Moves: umbrella count, a pass's first day, a started end?
- Live map: umbrellas booked elsewhere drop silently from a half-filled form (all: draft lost);
  notice + keep draft? Cap streams per user? Midnight: move "today"? Search/admin not live.
- Phones: sheet for portrait tablets (768–1023px)? Activity folded on phones? Android: DayNight?
  Versions (min 7.0; `interactive-widget`?), auto-retry, `FLAG_SECURE`? Tailscale terms, who?
- Android supply chain (Gradle verification, image digests, plugin 9.x). No CSP from Caddy, no
  `Cache-Control: no-store`. `picomatch` ReDoS in dev tooling (`npm audit`): upgrade in a chore.
- GDPR (needs ADR): retention/redaction of customers, audit log, check-ins, no-shows; FK restrict.
- Owner: cancelled names shown to all staff (initials?); undo "Ripristina"? No rate limits
  (booking, suggest, move, undo, check-in, live streams); new bookings don't check spots vs area.
- Minor: "retire" for umbrellas with past bookings (FK restrict); quick book "Another suggestion"
  resets the form, 101 + 201 not offered over 101 + 103; venue name takes control chars; setup
  numbers take `true`/`1e1`; `formatEur` in cents? Map space and session length per tablet?
- Ruleset `rulset1` requires `docker`, `checks`: add `e2e`, `deploy-scripts`, `android`. RUNBOOK
  firewall says `192.168.1.0/24` (box: `.0.0/24`). E2E uses all 5 sign-ins/minute (CI retries).

## Known issues
- Sessions can't pull Docker images, reach Google Maven, get Playwright browsers (e2e: system
  Chrome, `channel: "chrome"`) or push tags. `next dev` re-creates AGENTS.md (committed).
