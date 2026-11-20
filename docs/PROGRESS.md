# Progress
> Rewritten (not appended) at every `/wrap-up`. Keep under 40 lines. Git history keeps old versions.

## Current state
- `v0.13.1` released and deployed (live map stale-state fix, #67; before it `v0.13.0`, nightly backups, #65). Backup setup on the box not done yet.

## Done this session
- Communal (shared tablet) accounts, branch `feat/communal-accounts` (ADR 0024, plan in
  `docs/plans/communal-accounts.md`): flag at account creation, 30-day session, "Who is doing this?"
  pop-up (first action, then after 2 min idle), actions and Undo per chosen person. 1207 tests
  pass; security and reviewer agents ran, findings fixed. Not merged yet.
- Missing: Playwright e2e at tablet and phone width (pop-up, chosen name recorded, idle re-prompt).

## Next up
0. Merge `feat/communal-accounts` after CI is green and the e2e above is added; then tick the
   ROADMAP line and release.
1. Owner: RUNBOOK "Backups" setup on the box (install timer, key on PC, rclone OneDrive, SMTP,
   heartbeat, test run). Until then no nightly backups run. Delete branch `feat/backups`.
2. Owner: enter the lettini/sdraie stock in Beach settings.
3. Prices, payments at the desk, daily cash-up (Milestone 2).

## Open questions
- Communal tablets: no PIN (owner, attribution only for "who to ask"); add one if payments
  (Milestone 2) need accountability. `audit_log` records the person, not the tablet (`via_user_id`?).
  Pop-up lists every active staff member: an "on duty" list? Choosing a person has no rate limit.
- Backups: tenant SMTP AUTH (else Brevo)? apt may downgrade `rclone selfupdate`; no TERM test;
  "last backup" in admin? GDPR (ADR): customers, audit log, no-shows, backups, old db copy.
- Deckchairs: edit on a booking (audited, undo)? "+N" on tiles? Stock (ADR 0021): no warning on
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
