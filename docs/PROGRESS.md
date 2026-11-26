# Progress
> Rewritten (not appended) at every `/wrap-up`. Keep under 40 lines. Git history keeps old versions.
## Current state
- `v0.19.0` tagged 2026-11-26 on the #126 merge (waves #124, search toggle #125, user button #126); deploy on the box not confirmed yet.
  `v0.18.7` (#123) deployed (owner, 2026-11-26), as were `v0.18.6`, `v0.18.4`, `v0.18.3`. `v0.18.5`: docs-only, tagged by mistake.
  No migration, APK as v0.16.0. No backups on the box yet. Tag `v.0.18.1`: mistaken duplicate of `v0.18.1` (owner may delete).
## Done this session
- #123 (`feat/area-menu`): banner map link names the space with a ▾ list (keeps the day); sea band name large and pinned;
  last space per device in an `area` cookie, one rule on server and menu (`pickArea`, ADR 0032). e2e project `spaces` before `stock`.
- #124 (`feat/sea-waves`): a wave each side of the sea band; smaller name on phones so it fits.
- #125 (`feat/search-toggle`, canvas draft approved): search row gone; magnifier after the calendar opens the field (tablet: same
  row; phone: replaces the date bar). ✕/Escape return focus; an empty field closes on blur. Phones show "Oggi" for "Torna a oggi".
- #126 (`feat/user-menu-name`): user button shows a person icon + the name; "Accesso come …" stays as aria-label and title.
- Also: CI race fixed in `acting-dialog.test.ts`. 1600 unit/integration pass; 148 e2e (2026-11-26).
## Next up
1. Owner: deploy `v0.19.0` (`scripts/update.sh v0.19.0`); try the space menu and search on the SM-T220 and OnePlus; logo files in `BRANDING_DIR`, `CLUB_NAME`/`BRANDING_DIR` in `.env`.
2. Regular-customer history (`feat/customer-history`, Milestone 2, unblocked). Cabins (`feat/cabins`) still need the owner's description (how many, day or season, tied to an umbrella?).
3. Owner: try Arturo/Sera outdoors; 2027 prices on the box; backups (RUNBOOK; delete `feat/backups`); GDPR retention and phone masking.
## Open questions
- Themes: with a panel open on a 1280px tablet the map scrolls sideways, and tiles reflow when the panel opens (a quick second tap can miss); fixed track widths? Theme the activity list's "Ripristina" buttons? Day colours on the date bar in Light/Dark too? Remove Light/Dark later? Android full brightness in sun themes (APK rebuild)?
- Till (fiscal receipts): can the app send each sale to the club's registered till (RT) on the local network? Needs the till's make and model (owner).
- Prices next: refunds on cancelled bookings; a paid badge on map tiles (ADR 0017/0031); a payment PIN (ADR 0025); cabins (roadmap item).
- Prices review notes: a price-list change logs no before/after amounts; admin actions have no rate limit (ADR 0027); no test prices a standalone sunbed spot; Android full screen for Prezzi?
- Security (plan "Not closed by Batch 1"): the map sends names, phones and notes for any date, unthrottled; the fix needs decision 3. Parallel sign-ins can burst past the lock check (5/min per address). Check that Caddy sees real client IPs on the box (RUNBOOK).
- Not done: encrypted pre-update dumps (BitLocker instead); Gradle `verification-metadata.xml`; `booking_before_restore` stays until the owner drops it.
- Communal tablets: no PIN (owner: attribution only); `audit_log` has no tablet id (`via_user_id`).
- Multi-day bookings keep the 11:00 hold rule (ADR 0004/0015) but are never checked in, so each day is flagged `no_show`. Hold rule for one-day bookings only (new ADR)? Owner left it open 2026-11-19.
- Review notes, not fixed: today's list renders up to 500 rows on every refresh; `venueDayStart` assumes UTC+1/+2; migration `0014` left stock warnings effectively off until set per space; an 11th live stream shows "connection lost".
- Backups: tenant SMTP AUTH (else Brevo)? apt may downgrade `rclone selfupdate`; "last backup" in admin?
- Deckchairs: edit on a booking (audited, undo)? "+N" on tiles? Stock (ADR 0021/0026): no warning on undo/restore or on lowering it; date moves warn on all days; no venue-wide total.
- Search: `unaccent`? ADR 0018: an earlier own hold wins; no e2e for the no-show tile. Moves: a pass's first day?
- Accessibility: screen readers out of scope (owner, 2026-11-20); the season-tile badge is deferred; palette changes need owner OK (ADR 0017).
- Live map: midnight "today" rolls over at the next refresh. Phones: portrait-tablet sheet? Android: DayNight, min 7.0, auto-retry? Tailscale terms: who signs up?
- Also open: two no-shows on one umbrella/day show as one; bookings vs area spots; FK restrict; "Ripristina" undo; initials for cancelled names; quick book "Another suggestion" resets the form.
- Space menu: free counts per space in the list? Its space list refreshes only on a reload. Map search now needs JS; iOS closes an empty search on "Cerca". Logo (#113, low): Caddy re-compresses PNGs; no per-response sandbox CSP on `/branding/logo`.
- Ruleset `rulset1`: add `e2e`, `deploy-scripts`, `android`. RUNBOOK firewall `192.168.1.0/24` (box `.0.0/24`). New specs that sign in need their own `ownSignInBucket`.
## Known issues
- Sessions can't pull Docker images, reach Google Maven or push tags. e2e: local Postgres 16 (`service postgresql start`), `.env` from the example, migrate + `db:seed-admin` only (the demo seed's 18-umbrella lines break `quick-book.spec`), export `.env` before `npx playwright test`; symlink `/opt/pw-browsers/*-1243` to `-1254`. Full e2e run: 148 passed (2026-11-26, setup project included). Stop leftover `next-server` on :3000 (`fuser -k 3000/tcp`) before a new build.
- Re-running e2e on a used database: once a day's first line is full, a just-booked umbrella's panel closes with "no longer free"; reset the database between full runs. `check-in.spec` takes the last free umbrella; the others take the first. Session background processes (Postgres, `npm run dev`) stop between turns: restart before tests.
