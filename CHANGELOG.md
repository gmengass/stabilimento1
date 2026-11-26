# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/). Versioning: [SemVer](https://semver.org/).

## [Unreleased]
### Changed
- The search field above the map is gone: a magnifier after the calendar opens it, ready to type.
  On a tablet it opens on the same row; on a phone it takes the date bar's place until you close
  it with ✕ or Escape. An empty field closes by itself when you tap elsewhere.
- On phones, "Torna a oggi" is shortened to "Oggi" so the magnifier fits beside the date controls.
- The logged-in user's button in the banner shows a person icon and the name only ("admin"),
  not "Accesso come admin". Screen readers and the mouse tooltip still say "Accesso come admin".
- The sea band has a small wave on each side of "MARE" and the space name. On phones the name is a
  little smaller so it fits; a very long name is cut short with "…".

## [0.18.7] - 2026-11-26
Update with `scripts/update.sh v0.18.7` (no migration; no new APK).
### Changed
- The beach-space buttons above the map are gone. With two or more spaces, the banner's map link
  names the space being viewed, and the ▾ button beside it lists the spaces; picking one keeps the
  day being viewed. With one space the banner is unchanged.
- The sea band names the space in large bold letters ("MARE Spiaggia principale"), and stays in
  view while a wide map scrolls sideways on a phone.
- The map reopens the space last viewed on that tablet or phone, also after Prezzi, the admin
  pages or a restart of the app.

## [0.18.6] - 2026-11-26
Update with `scripts/update.sh v0.18.6` (no migration; no new APK).
### Changed
- The day's counts above the map show an icon and "free / total" instead of a sentence: an umbrella
  for "Ombrelloni liberi", a sunbed for "Lettini liberi", a sunbed with a box for "Lettini in
  magazzino" and a deckchair for "Sdraie". Arturo and Sera colour them like the club's umbrellas
  and sunbeds. Screen readers and mouse tooltips still give the full sentence.

## [0.18.5] - 2026-11-26
Tagged on the docs-only #119 merge: no change to the app. The count icons (#120) went into a
side branch by mistake and ship in 0.18.6.

## [0.18.4] - 2026-11-26
Update with `scripts/update.sh v0.18.4` (no migration; no new APK).
### Added
- When the map shows a day other than today, a line under the date bar names it: "Stai guardando
  mercoledì 25 nov 2026 (ieri)", "(domani)", "(3 giorni fa)", "(tra 3 giorni)".

### Changed
- Arturo and Sera: the date bar is coloured by day. "Giorno prima" is sand, today is green,
  "Giorno dopo" is outlined in orange and "Torna a oggi" is sunbed yellow; the calendar button
  takes the colour of the day it shows.
- "Giorno prima", "Giorno dopo", "Calendario" and "Cerca" are icon buttons (arrows, a calendar, a
  magnifying glass), so the date bar fits in one row on phones and small tablets. Screen readers
  and mouse tooltips still give their names; "Oggi" and "Torna a oggi" keep their words.
- Phones show a short weekday in the date bar: "Oggi: gio 26 nov", "mer 25 nov".
- "Esci" moved into the logged-in user's menu, under language and theme, with a log-out icon.

## [0.18.3] - 2026-11-26
Update with `scripts/update.sh v0.18.3` (no migration; no new APK), then add `CLUB_NAME` and
`BRANDING_DIR` to `.env` for the logo.
### Added
- Club logo on the sign-in page, at the left of the top bar (it opens the map) and on Prezzi, from
  `logo.png` and `logo-dark.png` in a folder on the box (`BRANDING_DIR`, `CLUB_NAME` in `.env`;
  RUNBOOK, "Club name and logo"). Dark backgrounds use the dark version. Without the folder,
  nothing changes.

### Changed
- Small tablets in landscape (from 768 px wide, such as the Galaxy Tab A7 Lite) show the booking
  panel beside the map instead of below it. Portrait is unchanged.
- New booking form: "Abbonamento stagionale" is below the dates instead of above them, and the
  line under Note ("Non scrivere qui dati sanitari o di pagamento") is gone.

## [0.18.2] - 2026-11-24
Update with `scripts/update.sh v0.18.2` (no migration; no new APK).
### Changed
- The band's title starts with the umbrella number and is a little smaller, so it fits in full:
  "101 · Rossi Mario", "104 · Nuova prenotazione".
- Booking panel, every theme: with one umbrella, sunbeds and deckchairs sit on one line (the
  umbrella number moves above it when the panel is narrow); with several, each umbrella keeps its
  sunbeds row and deckchairs are on one line below. An open booking reads "101 · 2 lettini · 1
  sdraio" (the word "Ombrellone" is dropped from these lines).

### Fixed
- Arturo: undone entries in today's activity list were too faint on the sand background; they
  now meet the contrast minimum.

## [0.18.1] - 2026-11-24
Update with `scripts/update.sh v0.18.1` (no migration; no new APK).
### Changed
- In Arturo and Sera the booking panel matches the top bar (docs/plans/theme-panel.md): a green
  band with the orange stripe holds the title and Close, the main button of each panel (and Quick
  book on the map) is orange, the other buttons are outlined in green (grey-blue in Sera), and
  cancelling a booking is dark red. Light, Dark and Automatic are unchanged.

## [0.18.0] - 2026-11-24
Update with `scripts/update.sh v0.18.0` (migration 0018; no new APK). Pick Arturo or Sera per
tablet in the user menu → Theme.
### Added
- Search results and the admin pages (Beach settings, Seasons, price list) say when bookings or
  the setup changed on another device, with a Reload button; the Prezzi page updates itself
  (ADR 0030, migration 0018).
- Two more themes in the user menu (ADR 0031), chosen per tablet like the others: **Arturo**
  (sand background) and **Sera** (night blue, dark). Both have a dark green top bar with an
  orange stripe. Automatic, Light and Dark are unchanged.
- In Arturo and Sera the map uses larger "sun tiles" for bright light: 64 × 72 px, solid
  colours, a thick outline, a bigger number and name, and a letter in the corner (P booked, ✓
  checked in, S season pass, ? no-show; in English B for booked), so the map reads without
  colour. A line of 18 umbrellas still fits a 1280px landscape tablet.

### Fixed
- On wide screens the map takes the full width until a booking panel opens; the empty panel
  column no longer pushes a long line into sideways scrolling.

## [0.17.0] - 2026-11-24
Update with `scripts/update.sh v0.17.0` (migration 0017; no new APK). Then enter the 2027 prices.
### Added
- Prices (ADR 0029): the admin enters each season's price list under Seasons → Price list (rows
  for 1 to 31 days and a season row; one piece and umbrella + 2 pieces), filled in from the
  previous season. Enter the 2027 prices on the box before the season opens.
- Every booking shows a suggested price, how it adds up, and the discount against the daily
  price; quick book shows it too. Season passes are priced by their days less released days,
  never more than the season row.
- A "Paid" tick on each booking records who ticked it and when, shows in today's activity and can
  be undone. If the price changes after the tick, the booking warns.
- "Prezzi" in the top bar opens the price list full screen for everyone.

## [0.16.0] - 2026-11-24
### Added
- The sign-in page remembers the last username that signed in on the device (tablet app and
  browser) and asks only for the password. A failed sign-in is not remembered.
- The tablet app has an icon, and the box can give it the club's own name and icon
  (`ANDROID_APP_NAME`, `ANDROID_ICON_DIR` in `.env`; RUNBOOK "Club name and icon"). Rebuild the APK
  to see it.

### Security
- The app connects to the database with its own account, which can read and write the tables
  but not change the schema, the audit trail, roles or files. `scripts/update.sh` sets it up.
  **Before updating**, add `APP_DATABASE_URL` to `.env` with the one-liner in the RUNBOOK
  ("Update") so the app switches at once. Without it the update still works, and the app keeps
  the old account until the next update.
- Containers run without extra privileges; the app's files are read-only.
- Base images and CI actions are pinned; Dependabot proposes updates as PRs.
- The tablet app trusts only the club's own certificate. Rebuild it with `scripts/build-android.sh`.
- Optional: `update.sh` installs only signed release tags (RUNBOOK, "Signed release tags"). It
  never installs a release older than the current one: that is `scripts/rollback.sh`.
- Sign-in: 10 wrong passwords for one username from one device within 15 minutes lock it on that
  device for 15 minutes; 100 from all devices lock it everywhere. Admins see the lock on the staff
  page and can lift it ("Unlock sign-in"); a password reset lifts it too. Migration `0015`
  (ADR 0027).
- Searches (30 a minute, 400 a day) and booking actions (60 a minute) are limited per account, per
  tablet for shared tablet accounts, and per address, to slow copying the customer list.
- The tablet app blocks screenshots and hides its content in the recent-apps view.
- A Content-Security-Policy: scripts, styles, images and connections from the app only; no
  framing, no plugins.
- Names and notes drop control and invisible characters (a NUL no longer causes an error, a
  right-to-left override can't disguise a name).
- Caddy, the HTTPS proxy in front of the app, is updated to 2.11.

### Fixed
- The map's "Today's activity" list no longer reads the whole audit log on every load: an index
  on the entry time keeps it fast as the log grows over the season. Migration `0016` (adds an
  index only; rollback drops it).
- Keyboard: on tablets and computers, opening a booking or Quick book with Enter moves focus into
  the panel, and focus goes back to the umbrella when it closes. "Skip to content" works on the map.
- Shared tablets: when the person acting changes or goes idle, the Undo buttons follow at once;
  the "Who is doing this?" names are reloaded, so a disabled person isn't offered; each tablet
  keeps its own language; many tablets no longer run out of live-map connections.
- Rolling back migration `0013` logs shared tablets out first.

## [0.15.0] - 2026-11-21
### Added
- Accessibility: a "Skip to content" link, a distinct page title per page, a clearer keyboard focus
  ring, and on phones the booking sheet takes keyboard focus and gives it back to the tile.
  Login fields and tap-to-call phone numbers are larger to tap.

## [0.14.0] - 2026-11-20
### Changed
- Sunbed and deckchair stock is now set per beach space, in each space's panel in Beach settings.
  Counts, over-stock warnings and the activity log use that space (ADR 0026).
- Migration `0014` moves the old venue-wide stock to the first space, so enter the real stock for
  every space after updating. Rolling back (`down`) adds the spaces' stock together, capped at 9999.

## [0.13.4] - 2026-11-20
### Added
- Check in at creation: a one-day booking for today shows a "Check in now" checkbox, ticked by
  default. Checked in, it is never flagged as a no-show at the hold time. Multi-day bookings and
  season passes are not checked in at creation (ADR 0015 amendment).
- Shared tablets: an admin can create a staff account flagged "shared tablet". It stays logged in
  for 30 days. The first booking, move, cancel or check-in asks "Who is doing this?", and again
  after 2 minutes idle. Actions are recorded under the person chosen, so Undo works per person
  (ADR 0025).

### Changed
- The activity list on the map shows everything that happened today, not only the last 10
  actions, and any of today's actions can be undone (staff: their own within 30 minutes; admins:
  any). At most the latest 500 are listed (ADR 0024).

## [0.13.3] - 2026-11-19
### Added
- Map tiles show sunbeds and deckchairs beyond the default: `+L` / `-L` for sunbeds against the
  umbrella's included ones, `+S` for the booking's deckchairs on its first umbrella. Default
  bookings show nothing (ADR 0023).

## [0.13.2] - 2026-11-19
### Changed
- Live map: each user may hold 10 open streams (more get 429 with Retry-After), and a steady
  stream of changes can no longer postpone the refresh: the map refreshes at least every 2 s
  (updates ADR 0019).

## [0.13.1] - 2026-11-19
### Fixed
- Live map: a spot booked elsewhere and then freed no longer comes back selected, and a move in
  progress drops targets whose booking was cancelled elsewhere, with a notice saying why.
- Live map: a new day starts with a blank selection, quick-book pick and move.

## [0.13.0] - 2026-11-19
### Added
- Nightly backups: every night at 03:30 the box backs up the database, checks it restores,
  encrypts it with age and keeps 14 days on the box and on OneDrive. A failure emails the owner;
  an optional heartbeat URL catches nights with no backup at all (ADR 0022).
- `scripts/restore-backup.sh`: monthly restore test (`--test latest`) and full restore on a new
  box from OneDrive. The backup is checked in a scratch database before it replaces anything.

## [0.12.0] - 2026-11-19
### Added
- Stock of lettini and sdraie: in Beach settings an admin enters how many the club owns (blank:
  not counted). The map's day counts then show how many are left that day for the whole beach,
  and a booking, season pass or move to new dates that would go over shows the days short and
  "Prenota comunque" / "Sposta comunque" to save it anyway (ADR 0021).

## [0.11.0] - 2026-11-19
### Added
- Live map: a booking, cancellation, move, undo, check-in or no-show made on one device shows on
  every other open map within seconds, without reloading. If the connection drops, the map
  says "Non aggiornato in tempo reale, riconnessione…" and catches up when it is back
  (ADR 0019).
- Deckchairs (sdraie): a booking or season pass can ask for up to 2 deckchairs per umbrella, in
  the booking form and in quick book. Sunbeds stay as before (2 per umbrella by default). The
  booking shows "2 sdraie" and the activity list mentions them (ADR 0020).
### Removed
- The line "Tocca gli ombrelloni liberi per prenotarli, o uno prenotato per vederlo." under the
  day counts, to reduce clutter above the map.

## [0.10.0] - 2026-11-18
### Added
- Admins can set the check-in time for day and multi-day bookings in Beach settings ("Check-in
  by", 11:00 until changed). Bookings with their own hold time keep it; season passes are
  never freed (ADR 0018).
### Changed
- Map header: the space name and the date above the map are gone; the space tabs stay. The Today
  button now shows the day and date ("Oggi: mercoledì 18 nov 2026"; on phones "Oggi: mercoledì
  18 nov"). On another day, the calendar button shows the day being viewed instead of
  "Calendario".

## [0.9.0] - 2026-11-18
### Added
- Light and dark theme: tap your name, then pick Theme: Automatic (follows the device), Light or
  Dark. The choice is saved on that device. Every screen now has dark colours (ADR 0017).
- Day counts: above the map, "Umbrellas free X / N" and "Sunbeds free Y / T" for the space and
  day shown. No-shows and released days nobody rebooked count as free.
- Search: type part of a customer's name or phone (spaces and +39 don't matter) to find current
  and future bookings, at most 20. Tap one to open it on the map, on the day you were viewing
  if it is there, otherwise its next day.
### Changed
- The "Free" count in the map legend is replaced by the day counts.

## [0.8.0] - 2026-11-18
### Added
- Check-in: open a booking on today's map and tap Check in (or Remove check-in). Checked-in
  umbrellas show a ✓ and their own colour.
- The 11:00 hold rule: day and multi-day bookings not checked in by 11:00 become no-shows
  within a minute. Their umbrellas are free to book again, but stay marked with the customer's
  name. If the customer turns up, give the umbrellas back with one tap, if they are still free.
- Late arrival: keep a booking's umbrellas until a later time (e.g. 13:30), shown on the map.
- Check-ins, late arrivals and restored no-shows show in Recent activity and can be undone;
  automatic no-shows show as "System". Season passes are never freed.
### Database
- Migration `0009` (check-ins, the venue's hold time, activity entries without a user). Rolling
  it back is refused once anyone was checked in or flagged: restore the backup taken before the update.

## [0.7.0] - 2026-11-17
### Added
- Move a booking: open it on the map, tap Move, then tap the new umbrella for each of its
  umbrellas. A booking that hasn't started can also get new dates; a started booking or a season
  pass moves from a day you choose, and earlier days stay where they were. The move shows in
  Recent activity and can be undone.
### Database
- Migration `0008` (booking umbrellas can be "former", and the activity log stores moves). Rolling
  it back is refused once a booking has been moved: restore the backup taken before the update.

## [0.6.0] - 2026-11-17
### Added
- Phones: the booking panel slides up over the map as a sheet, so umbrellas can still be tapped
  while booking. Collapse it to its header to look at the map, or close it (Escape works too).
### Changed
- Buttons, links and fields on the map page are at least 44px tall, easier to tap on tablets
  and phones. The top bar wraps on narrow screens.

## [0.5.1] - 2026-11-16
### Fixed
- Opening the app by the box's IP (`https://192.168.x.x`) failed with a TLS error, in browsers
  and in the Android app's IP fallback. Set `DEFAULT_SNI` to the box's IP in `.env` (RUNBOOK).

## [0.5.0] - 2026-11-16
### Added
- Recent activity under the beach map: the last 10 actions for the whole venue (bookings,
  season passes, cancellations, last days, released and given-back days, beach and season
  changes), with who did them and when. Tap its title to fold it away.
- Undo from the activity list: staff can undo their own actions for 30 minutes, admins any of
  the 10. Undo refuses, changing nothing, if the booking has changed since or an umbrella it
  would book again is now taken. An undo can itself be undone.
- Android app for club tablets and phones (Android 7.0+), built on the box with
  `scripts/build-android.sh`. It opens the booking app full screen, trusts the club's certificate
  without installing it on the device, keeps the screen on, and shows "Server not reachable,
  Retry" when the box can't be reached. With `REMOTE_URL` set, it falls back to the box's
  Tailscale address. Install and screen-pinning steps are in the RUNBOOK.

## [0.4.0] - 2026-11-16
### Added
- Quick book on the beach map: enter the customer, how many umbrellas and sunbeds, and the days
  or a season pass; the app suggests free umbrellas (side by side and nearest the sea first),
  selects them on the map, and staff confirm with one tap. "Another suggestion" shows the next
  option; tapping umbrellas on the map changes the choice.

### Changed
- Day and multi-day bookings can no longer start on a past day.

## [0.3.2] - 2026-11-16
### Changed
- Picking a day in the map's calendar opens it straight away; the "Show" button is gone.
- When the map shows a day other than today, the Today button reads "Go to today" and is
  highlighted.

### Fixed
- On the beach map, the previous day, today, next day and calendar controls always stay
  together on one line instead of breaking across two.

## [0.3.1] - 2026-11-15
### Changed
- The beach space tabs sit on the same row as the date and day buttons, saving a line above
  the map.

## [0.3.0] - 2026-11-15
### Added
- Seasons and season passes: admins set up one season per year at `/admin/seasons` (the form
  suggests the next 1 May – 30 September; the next season can only be added after the current
  one ends). On the
  map, tick "Season pass" when booking: give the holder's first day, and their last day only if
  they know it (otherwise the pass runs to the end of the season). Passes show in violet.
- Last day: open a pass and set the holder's last day once they know it; the umbrellas are free
  from the day after.
- Released days: open a season pass and release the days the holder won't use. Those umbrellas
  are free to book on those days (dashed violet border, with the holder's name); tap one to give
  the day back to the holder while it is still free. The pass shows how many days were released.

## [0.2.2] - 2026-11-13
### Changed
- The phone number is optional when booking: leave it empty for customers who give only a name.
- After login the language choice is behind the user's name: tap "Signed in as …" in the top
  bar to change it. The login screen still shows it directly.

### Fixed
- `scripts/setup-wsl.sh` stopped at "Installing" with `sg: not found` on Ubuntu 24.04 WSL; it no
  longer needs `sg`.

## [0.2.1] - 2026-11-12
### Fixed
- Updating the server failed at the migration step ("EACCES: permission denied") when a release
  added new files: the update script checked them out readable by their owner only. Releases
  are now checked out readable, and the migration image owns its sources either way.

## [0.2.0] - 2026-11-12
### Added
- Beach map on the home screen: sea at the top, line 1 nearest to it, umbrellas left to right.
  Pick any date, or step a day back or forward.
- Admins set up a fresh beach at `/admin/beach`: club name, number of lines and umbrellas per
  line, numbered line × 100 + position.
- Bookings from the map: tap free umbrellas, enter name and phone, pick the days and the
  sunbeds per umbrella, and book. Booked umbrellas show the customer's name; tap one to see the
  booking or cancel it. The database refuses double bookings, even from two tablets at once,
  and staff see which umbrella and day clashed.
- Beach settings (`/admin/beach`) can be changed at any time: rename the club, add a line
  behind, add umbrellas to a line, remove the last line, and tap an umbrella to change its
  number and sunbeds or remove it. Umbrellas that have bookings can't be removed.
- Several beach spaces: admins add, rename and remove spaces in Beach settings, each with its
  own lines and umbrellas (numbered from 101 again). The map has a tab per space, and the space
  being viewed is named in large letters and on the sea band; new bookings show it too.

### Changed
- Roadmap Milestone 1 now lists the beach club features from the project brief.

## [0.1.1] - 2026-11-11
### Added
- `scripts/setup-wsl.sh vX.Y.Z` sets up a Windows + WSL2 box in one command (`docs/RUNBOOK.md`).

## [0.1.0] - 2026-11-11
### Added
- Project skeleton, workflow docs, Claude agents and commands.
- App scaffold: Next.js 16, PostgreSQL migrations with rollback, `/health` endpoint,
  Docker Compose stack and CI.
- Beach layout schema: venues, areas, lines and numbered umbrella/sunbed spots, with a demo
  seed (`npm run db:seed`).
- Interface in Italian and English, with a language switcher on every screen that keeps
  typed input; the choice is remembered in a cookie.
- Staff and admin login with username and password; every screen needs a login. Sessions
  last 12 hours, and logins are rate-limited.
- Admins manage staff accounts at `/admin/staff`: create, disable/enable, reset password.
- First admin account via `npm run db:seed-admin` (or `docker compose run --rm seed-admin`).
- The interface language is saved on the user and follows them to any device.
- Server deployment: HTTPS through Caddy, `scripts/update.sh vX.Y.Z` and `scripts/rollback.sh`
  with an automatic pre-update database dump. Setup and recovery steps are in `docs/RUNBOOK.md`
  (Windows with WSL2, or Linux).

### Changed
- Demo umbrellas are numbered line × 100 + position (101–118 in line 1; 201… in line 2),
  position 1 being the leftmost umbrella facing the sea. The demo beach has 18 per line (108).
- The full Docker stack is served at `https://localhost` (port 3000 is no longer published).
  Login rate limiting can no longer be bypassed with a forged `X-Forwarded-For` header.
