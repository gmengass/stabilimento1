# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/). Versioning: [SemVer](https://semver.org/).

## [Unreleased]
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
