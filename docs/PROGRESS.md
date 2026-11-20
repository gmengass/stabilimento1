# Progress
> Rewritten (not appended) at every `/wrap-up`. Keep under 40 lines. Git history keeps old versions.
## Current state
- `main` is at the merge of #76, last tag `v0.13.4` (released and deployed, owner, 2026-11-20).
  Backup setup on the box not done yet. Branch `feat/stock-per-space` is open (PR, not merged).
- E2E: `login` and `communal` specs each use their own sign-in bucket (`ownSignInBucket`, #74).
## Done this session
- Stock per beach space (ADR 0026, owner 2026-11-20): `area.sunbed_stock` / `deckchair_stock`
  replace the venue columns (migration 0014; old venue stock goes to the first space, `down`
  sums, capped at 9999). Set in each space's panel in Beach settings; counts, warnings and the
  activity log use that space. Unit + integration tests pass; e2e not run (sessions can't).
## Next up
1. Owner: try one communal tablet with real staff (no PIN: watch for wrong names).
2. Owner: RUNBOOK "Backups" setup on the box (install timer, key on PC, rclone OneDrive, SMTP,
   heartbeat, test run). Until then no nightly backups run. Delete branch `feat/backups`.
3. Owner: after v0.14 deploys, enter the lettini/sdraie stock for each space in Beach settings
   (the old venue stock lands on the first space).
4. Prices, payments at the desk, daily cash-up (Milestone 2).
## Open questions
- Communal tablets: no PIN (owner, attribution only for "who to ask"); add one if payments
  (Milestone 2) need accountability. `audit_log` records the person, not the tablet (`via_user_id`?).
  Pop-up lists every active staff member: an "on duty" list? Choosing a person has no rate limit.
- Multi-day bookings keep the 11:00 hold rule (ADR 0004/0015), but staff don't check them in:
  they go straight to the umbrella, so each day they'd be flagged `no_show`. Apply the hold rule
  to one-day bookings only (new ADR)? Owner left this open, 2026-11-19.
- Backups: tenant SMTP AUTH (else Brevo)? apt may downgrade `rclone selfupdate`; no TERM test; "last backup" in admin? GDPR (ADR): customers, audit log, no-shows, backups, old db copy.
- Deckchairs: edit on a booking (audited, undo)? "+N" on tiles? Stock (ADR 0021/0026): no warning on undo/restore/ lowering it; date moves warn on all days, not only added; no venue-wide total. Races pass.
- Search: rate limit, mask phones, `no-store`, `unaccent`? ADR 0018: earlier own hold wins; no e2e for the no-show tile. Owner: yesterday, partial, 1-day hold. Moves: a pass's first day?
- Activity: no e2e for undoing an older entry of today (sessions can't run Playwright).
- Live map: midnight "today" (rolls over at next refresh, clears selection; fine?). Phones: portrait-tablet sheet? Android: DayNight, min 7.0, `FLAG_SECURE`, auto-retry? Tailscale terms, who?
- Security audit 2026-11-20 (no Critical/High; Milestone 3). Medium: no customer erase/export/retention (GDPR, needs ADR; backups keep 14 days); communal sessions 30 days, no PIN, search 20 rows/query unthrottled, phones unmasked (shorten session, mask, lost-tablet RUNBOOK step); no rate limits on actions/search (`booking-actions.ts:30`); no `FLAG_SECURE` (`MainActivity.kt:34`). Low: no CSP and no `no-store` on `/search*` (`deploy/Caddyfile`); login has no per-account lockout (min 10 chars); plaintext `pre-update` dumps; Postgres on `127.0.0.1:5432`; `.env.example` `change-me` password; CI actions pinned by tag; 7 moderate dev-only `npm audit` (minimatch, `picomatch`): chore. Android supply chain (Gradle verification, image digests, plugin 9.x). Not fully read: booking libs, Gradle files.
- Owner: cancelled names shown to all staff? No rate limits (booking, suggest, move, undo, check-in, live). Minor: "retire" umbrellas with past bookings; quick book "Another suggestion" resets the form; venue name takes control chars; setup numbers take `true`/`1e1`.
- Also open: two no-shows on one umbrella/day show as one; bookings vs area spots; 101+201 over 101+103; `formatEur` cents; per-tablet space/session; search/admin not live; e2e restore; FK restrict; "Ripristina" undo; initials for cancelled names.
- Ruleset `rulset1`: add `e2e`, `deploy-scripts`, `android`. RUNBOOK firewall `192.168.1.0/24` (box `.0.0/24`). New specs that sign in need their own `ownSignInBucket`.
## Known issues
- `check-in.spec` now takes the last free umbrella (the others take the first); not run locally
  (sessions can't run Playwright): if it still fails in CI, give it a dedicated umbrella.
- Sessions can't pull images, reach Google Maven, get Playwright or push tags. `live-route` test
  fails without `.env` (CI passes); `next dev` re-creates AGENTS.md.
