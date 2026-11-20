# Progress
> Rewritten (not appended) at every `/wrap-up`. Keep under 40 lines. Git history keeps old versions.

## Current state
- `v0.13.3` released and deployed (tile marks, #69; earlier `v0.13.2` live map limits, `v0.13.1`
  stale-state fix, `v0.13.0` backups). Branch `feat/auto-checkin` has an open PR (e2e added, not
  run here; `security` found nothing). Backup setup on the box not done yet.

## Done this session
- Check in at creation (branch `feat/auto-checkin`, ADR 0015 amendment, plan
  `docs/plans/auto-check-in.md`): a one-day booking for today gets a "Check in now" checkbox,
  ticked by default; the check-in is part of the `book` entry and undoes with it. Multi-day
  bookings and passes are never checked in at creation.
- Reviewer asked for minor fixes (applied, not re-reviewed). Tests pass; full suite run before them.

## Next up
1. Merge `feat/auto-checkin` once CI (incl. the new e2e) is green; then tag the release.
2. Owner: RUNBOOK "Backups" setup on the box (install timer, key on PC, rclone OneDrive, SMTP,
   heartbeat, test run). Until then no nightly backups run.
3. Owner: enter the lettini/sdraie stock in Beach settings.
4. Prices, payments at the desk, daily cash-up (Milestone 2).

## Open questions
- Multi-day bookings keep the 11:00 hold rule (ADR 0004/0015), but staff don't check them in:
  they go straight to the umbrella, so each day they'd be flagged `no_show`. Apply the hold rule
  to one-day bookings only (new ADR)? Owner left this open, 2026-11-19.
- Backups: tenant SMTP AUTH (else Brevo)? apt may downgrade `rclone selfupdate`; no TERM test;
  "last backup" in admin? GDPR (ADR): customers, audit log, no-shows, backups, old db copy.
- Deckchairs: edit on a booking (audited, undo)? Stock (ADR 0021): no warning on
  undo/restore/lowering it; date moves warn on all days, not only added; per space? Races pass.
- Search: rate limit, mask phones, `no-store`, `unaccent`? ADR 0018: earlier own hold wins; no
  e2e for the no-show tile. Owner: yesterday, partial, 1-day hold. Moves: a pass's first day?
- Live map: midnight "today" (rolls over at next refresh; fine?). Phones: portrait-tablet sheet?
  Android: DayNight, min 7.0, `FLAG_SECURE`, auto-retry? Tailscale terms, who?
- Android supply chain, no CSP from Caddy, no `no-store`, `picomatch` ReDoS (`npm audit`).
  Owner: cancelled names shown to all staff? No rate limits (booking, suggest, move, undo,
  check-in, live). Minor: retire umbrellas with past bookings; venue name takes control chars.
- Also open: two no-shows on one umbrella/day show as one; bookings vs area spots; `formatEur`
  cents; per-tablet space/session; search/admin not live; FK restrict; "Ripristina" undo.
- Ruleset `rulset1`: add `e2e`, `deploy-scripts`, `android`. RUNBOOK firewall `192.168.1.0/24`.

## Known issues
- Sessions can't pull images, reach Google Maven, get Playwright or push tags. `live-route` test
  fails without `.env` (CI passes); `next dev` re-creates AGENTS.md.
