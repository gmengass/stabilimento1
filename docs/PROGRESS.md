# Progress
> Rewritten (not appended) at every `/wrap-up`. Keep under 40 lines. Git history keeps old versions.

## Current state
- `v0.13.3` released and deployed (tile marks, #69; earlier `v0.13.2` live map limits, `v0.13.1`
  stale-state fix, `v0.13.0` backups). Backup setup on the box not done yet.

## Done this session
- Tile marks (#69, ADR 0023): tiles show `+L`, `-L`, `+S` for extra/fewer sunbeds and deckchairs; tagged `v0.13.3`, deployed by the owner.

## Next up
1. Owner: RUNBOOK "Backups" setup on the box (install timer, key on PC, rclone OneDrive, SMTP,
   heartbeat, test run). Until then no nightly backups run.
2. Owner: enter the lettini/sdraie stock in Beach settings.
3. Prices, payments, daily cash-up (Milestone 2).

## Open questions
- Backups: tenant SMTP AUTH (else Brevo)? apt may downgrade `rclone selfupdate`; no TERM test;
  "last backup" in admin? GDPR (ADR): customers, audit log, no-shows, backups, old db copy.
- Deckchairs: edit on a booking (audited, undo)? Stock (ADR 0021): no warning on
  undo/restore/lowering it; date moves warn on all days, not only added; per space? Races pass.
- Search: rate limit, mask phones, `no-store`, `unaccent`? ADR 0018: earlier own hold wins; no
  e2e for the no-show tile. Owner: yesterday, partial, 1-day hold. Moves: a pass's first day?
- Live map: midnight "today" (rolls over at next refresh, clears selection; fine?). Phones: portrait-tablet sheet? Android: DayNight, min 7.0,
  `FLAG_SECURE`, auto-retry? Tailscale terms, who?
- Android supply chain (Gradle verification, image digests, plugin 9.x). No CSP from Caddy, no
  `Cache-Control: no-store`. `picomatch` ReDoS in dev tooling (`npm audit`): upgrade in a chore.
- Owner: cancelled names shown to all staff? No rate limits (booking, suggest, move, undo,
  check-in, live). Minor: "retire" umbrellas with past bookings; quick book "Another suggestion"
  resets the form; venue name takes control chars; setup numbers take `true`/`1e1`.
- Also open: two no-shows on one umbrella/day show as one; bookings vs area spots; 101+201 over
  101+103; `formatEur` cents; per-tablet space/session; search/admin not live; e2e restore; FK
  restrict; "Ripristina" undo; initials for cancelled names.
- Ruleset `rulset1`: add `e2e`, `deploy-scripts`, `android`. RUNBOOK firewall `192.168.1.0/24`
  (box `.0.0/24`). E2E uses all 5 sign-ins/minute.

## Known issues
- Sessions can't pull images, reach Google Maven, get Playwright or push tags. `live-route` test
  fails without `.env` (CI passes); `next dev` re-creates AGENTS.md.
