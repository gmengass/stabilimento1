# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/). Versioning: [SemVer](https://semver.org/).

## [Unreleased]
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
