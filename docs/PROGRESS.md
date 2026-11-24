# Progress
> Rewritten (not appended) at every `/wrap-up`. Keep under 40 lines. Git history keeps old versions.
## Current state
- `v0.17.0` (tagged 2026-11-24 on the #102 merge: prices, first version, ADR 0029) is deployed
  on the box (owner, 2026-11-24); APK unchanged since v0.16.0. No backups on the box yet. PR #103
  (`docs/release-0.17.0`, open): v0.17.0 changelog, progress and roadmap.
## Done this session
- Owner scoped prices (2026-11-24): a suggested price from the club's list (2027 prices) and a
  "paid" tick; receipts stay on the till. Plan `docs/plans/prices-payments.md`, ADR 0029.
- #102 (merged, v0.17.0): price list per season (admin, copied from the previous season), suggested price with
  discount in the panel and quick book, paid tick (audited, undoable, warns if the price changes),
  "Prezzi" page in the top bar, migration 0017, `formatCents`. Reviewer and security agents ran.
## Next up
1. Owner: enter the 2027 prices on the box (Seasons → Price list).
2. Owner: set up backups on the box (RUNBOOK; delete `feat/backups`).
3. Owner decisions: GDPR retention and phone masking (security item), tablet session length and design, "Trusted certificate" before the rest of Milestone 2.
## Open questions
- Till (fiscal receipts): later, can the app send each sale to the club's registered till (RT) on the
  local network so the till prints and transmits the receipt? Needs the till's make and model (owner).
- Prices next (payments and cash-up: roadmap): refunds on cancelled bookings; a
  paid badge on map tiles (palette OK, ADR 0017); a payment PIN (ADR 0025); cabins (roadmap item).
- Prices review notes: a price-list change logs no before/after amounts; admin actions have no
  rate limit (ADR 0027); no test prices a standalone sunbed spot; Android full screen for Prezzi?
- Security (plan "Not closed by Batch 1"): the map sends names, phones and notes for any date, unthrottled. The fix needs decision 3. Parallel sign-ins can burst past the lock check, bounded at 5/min per address. Check that Caddy sees real client IPs on the box (RUNBOOK).
- Not done: encrypted pre-update dumps (BitLocker instead); Gradle `verification-metadata.xml`; `booking_before_restore` stays until the owner drops it.
- Communal tablets: no PIN (owner: attribution only); `audit_log` has no tablet id (`via_user_id`).
- Multi-day bookings keep the 11:00 hold rule (ADR 0004/0015) but are never checked in, so each day is flagged `no_show`. Hold rule for one-day bookings only (new ADR)? Owner left it open 2026-11-19.
- Review notes, not fixed: today's list renders up to 500 rows on every refresh ("Show more"?); `venueDayStart` assumes UTC+1/+2; migration `0014` left stock warnings effectively off until set per space; an 11th live stream shows "connection lost".
- Backups: tenant SMTP AUTH (else Brevo)? apt may downgrade `rclone selfupdate`; "last backup" in admin?
- Deckchairs: edit on a booking (audited, undo)? "+N" on tiles? Stock (ADR 0021/0026): no warning on undo/restore or on lowering it; date moves warn on all days; no venue-wide total.
- Search: `unaccent`? ADR 0018: an earlier own hold wins; no e2e for the no-show tile. Moves: a pass's first day?
- Accessibility: screen readers out of scope (owner, 2026-11-20); the season-tile badge is deferred; palette changes need owner OK (ADR 0017).
- Live map: midnight "today" rolls over at the next refresh. Phones: portrait-tablet sheet? Android: DayNight, min 7.0, auto-retry? Tailscale terms: who signs up?
- Also open: two no-shows on one umbrella/day show as one; bookings vs area spots; search/admin not live; FK restrict; "Ripristina" undo; initials for cancelled names; quick book "Another suggestion" resets the form.
- Ruleset `rulset1`: add `e2e`, `deploy-scripts`, `android`. RUNBOOK firewall `192.168.1.0/24` (box `.0.0/24`). New specs that sign in need their own `ownSignInBucket`.
## Known issues
- Sessions can't pull Docker images, reach Google Maven or push tags. Playwright works with the system Chrome: symlink `/opt/pw-browsers/chromium*-1243` to the `-1254` names, then `npx playwright test` against a local Postgres (all 89 specs pass on a fresh database).
- Re-running e2e on a used database: once a day's first line is full, a just-booked umbrella's panel closes with "no longer free" (also on `main`); reset the database between full runs.
- `check-in.spec` takes the last free umbrella; the others take the first.
