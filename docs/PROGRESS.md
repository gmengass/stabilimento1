# Progress
> Rewritten (not appended) at every `/wrap-up`. Keep under 40 lines. Git history keeps old versions.
## Current state
- `v0.16.0` (tagged 2026-11-24 on the #100 merge) is deployed on the box, with the APK rebuilt as
  "Stabilimento Arturo" and the club icon (`ANDROID_APP_NAME`, `ANDROID_ICON_DIR`; the icon files
  live only on the box). It holds #83, #84, #95, #97, #98, #100 and the Dependabot updates (#85–#87,
  #91–#93); #88, #89 and #94 were closed unmerged. Backups are not set up on the box yet.
## Done this session
- Opus review of the Sonnet-era work finished: ADR 0024 (#73), ADR 0026 (#77), live stream limits
  (#68) and check-in at creation (#71), no bugs; #67 and #69 (display only) skipped. #97 adds the
  `audit_log.created_at` index. Owner kept "Check in now" ticked by default (#71).
- #98: the sign-in page remembers the last username. #100: tablet app icon, and the club's name
  and icon from `.env` (RUNBOOK "Club name and icon"); the logo is the hotel's, not committed.
## Next up
1. Owner: set up backups on the box (RUNBOOK; delete `feat/backups`).
2. Owner decisions: customer data retention (GDPR ADR) and masking phones on the map and in search close the security item; also tablet session length, tablet design (record the tablet and an "on duty" list now; a payment PIN in Milestone 2); whether "Trusted certificate" (Milestone 0) comes before Milestone 2.
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
- Till (fiscal receipts): later, can the app send each sale to the club's registered till (RT) on the
  local network so the till prints and transmits the receipt? Needs the till's make and model (owner
  to confirm). Until then staff ring up on the till; the app only suggests a price and marks paid.
- Ruleset `rulset1`: add `e2e`, `deploy-scripts`, `android`. RUNBOOK firewall `192.168.1.0/24` (box `.0.0/24`). New specs that sign in need their own `ownSignInBucket`.
## Known issues
- Sessions can't pull Docker images, reach Google Maven or push tags. Playwright works with the system Chrome: symlink `/opt/pw-browsers/chromium*-1243` to the `-1254` names, then `npx playwright test` against a local Postgres (all 85 specs pass).
- `check-in.spec` takes the last free umbrella; the others take the first.
