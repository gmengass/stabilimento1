# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/). Versioning: [SemVer](https://semver.org/).

## [Unreleased]
### Fixed
- Updating the server failed at the migration step ("EACCES: permission denied") when a release
  added new files: the update script checked them out readable by their owner only. Releases
  are now checked out readable, and the migration image owns its sources either way.

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

- Seasons and season passes: admins set up one season per year at `/admin/seasons` (the form
  suggests the next 1 May – 30 September). On the
  map, tick "Season pass" when booking: give the holder's first day, and their last day only if
  they know it (otherwise the pass runs to the end of the season). Passes show in violet.
- Last day: open a pass and set the holder's last day once they know it; the umbrellas are free
  from the day after.
- Released days: open a season pass and release the days the holder won't use. Those umbrellas
  are free to book on those days (dashed violet border, with the holder's name); tap one to give
  the day back to the holder while it is still free. The pass shows how many days were released.

### Changed
- The phone number is optional when booking: leave it empty for customers who give only a name.
- Roadmap Milestone 1 now lists the beach club features from the project brief.
- Demo umbrellas are numbered line × 100 + position (101–118 in line 1; 201… in line 2),
  position 1 being the leftmost umbrella facing the sea. The demo beach has 18 per line (108).
- The full Docker stack is served at `https://localhost` (port 3000 is no longer published).
  Login rate limiting can no longer be bypassed with a forged `X-Forwarded-For` header.
- After login the language choice is behind the user's name: tap "Signed in as …" in the top
  bar to change it. The login screen still shows it directly.
