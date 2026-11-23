# Progress
> Rewritten (not appended) at every `/wrap-up`. Keep under 40 lines. Git history keeps old versions.
## Current state
- `main` is at the merge of #97 (2026-11-23). #83, #84, #95 and #97 are merged but not tagged: the
  next tag (`v0.16.0`) holds them. `v0.15.0` is the last release and is deployed on the box. Backups
  are not set up on the box yet. Open PRs: Dependabot #85–#89, #91–#94; #89 (Postgres 17→19 needs a
  dump/restore) and #94 (Node 26 vs `.nvmrc` 24) need an owner decision.
- Box update to v0.16.0: first add `APP_DATABASE_URL` to `.env` (one-liner in CHANGELOG / RUNBOOK
  "Update"), then rebuild the APK (it now trusts the club root only). Migrations `0015` (a table)
  and `0016` (an index).
## Done this session
- Opus review of the rest of the Sonnet-era work: ADR 0024 (#73), ADR 0026 (#77), live stream limits
  (#68) and check-in at creation (#71). No bugs. #67 and #69 (display only) skipped.
- #97: index on `audit_log.created_at` (migration `0016`), so today's activity list stops reading
  the whole log on every map load. ADR 0024 notes it.
- Owner kept "Check in now" ticked by default (#71).
## Next up
1. Owner: tag v0.16.0 and update the box (add `APP_DATABASE_URL` first), rebuild the APK, set up backups (RUNBOOK; delete `feat/backups`).
2. Owner decisions: GDPR retention and phone masking (closes the security item); tablet session length and design; whether "Trusted certificate" (Milestone 0, needs the club domain and DNS provider) comes before Milestone 2.
3. Then Milestone 2: prices, payments at the desk, daily cash-up (`feat/prices-payments`).
## Open questions
- Security (plan "Not closed by Batch 1"): the map sends names, phones and notes for any date, unthrottled. The fix needs decision 2. Parallel sign-ins can burst past the lock check, bounded at 5/min per address. Check that Caddy sees real client IPs on the box (RUNBOOK).
- Not done: encrypted pre-update dumps (BitLocker instead); Gradle `verification-metadata.xml`; `booking_before_restore` stays until the owner drops it.
- Communal tablets: no PIN (owner: attribution only); `audit_log` has no tablet id (`via_user_id`).
- Multi-day bookings keep the 11:00 hold rule (ADR 0004/0015) but are never checked in, so each day is flagged `no_show`. Hold rule for one-day bookings only (new ADR)? Owner left it open 2026-11-19.
- Review notes, not fixed: today's list renders up to 500 rows on every refresh ("Show more"?); `venueDayStart` assumes UTC+1/+2; migration `0014` left stock warnings effectively off until set per space; an 11th live stream shows "connection lost".
- Backups: tenant SMTP AUTH (else Brevo)? apt may downgrade `rclone selfupdate`; "last backup" in admin?
- Deckchairs: edit on a booking (audited, undo)? "+N" on tiles? Stock (ADR 0021/0026): no warning on undo/restore or on lowering it; date moves warn on all days; no venue-wide total.
- Search: `unaccent`? ADR 0018: an earlier own hold wins; no e2e for the no-show tile. Moves: a pass's first day?
- Accessibility: screen readers out of scope (owner, 2026-11-20); the season-tile badge is deferred; palette changes need owner OK (ADR 0017).
- Live map: midnight "today" rolls over at the next refresh. Phones: portrait-tablet sheet? Android: DayNight, min 7.0, auto-retry? Tailscale terms: who signs up?
- Also open: two no-shows on one umbrella/day show as one; bookings vs area spots; `formatEur` cents; search/admin not live; FK restrict; "Ripristina" undo; initials for cancelled names; quick book "Another suggestion" resets the form.
- Ruleset `rulset1`: add `e2e`, `deploy-scripts`, `android`. RUNBOOK firewall `192.168.1.0/24` (box `.0.0/24`). New specs that sign in need their own `ownSignInBucket`.
## Known issues
- Sessions can't pull Docker images, reach Google Maven or push tags. Playwright works with the system Chrome: symlink `/opt/pw-browsers/chromium*-1243` to the `-1254` names, then `npx playwright test` against a local Postgres (all 86 specs passed for #95).
- `check-in.spec` takes the last free umbrella; the others take the first.
