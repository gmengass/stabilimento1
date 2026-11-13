# Roadmap

One item = one branch = ideally one session. Tick items when merged.
Draft milestones below. Adjust them after PROJECT_BRIEF.md is filled in.

## Milestone 0 — Foundations
- [x] Repo, license, agents, workflow docs
- [x] Confirm tech stack (ADR 0002 → Accepted)
- [x] Hosting decision (ADR 0003)
- [x] Scaffold app, lint/format, test runner, CI green
- [x] Deploy: Docker Compose stack (app, PostgreSQL, Caddy), update/rollback scripts, RUNBOOK (ADR 0003)
- [ ] Backups: nightly encrypted pg_dump to USB + OneDrive (rclone), retention, restore test, failure alert
- [x] Database + first migration (Venue, Area, Spot), seed data
- [x] Interface languages: Italian + English, switchable anytime incl. after login (ADR 0005)
- [x] Auth (log in, roles, staff accounts) (ADR 0007)
- [x] Umbrella numbering: line × 100 + position, position 1 = leftmost facing the sea (ADR 0004)

## Milestone 1 — Core booking (MVP, PROJECT_BRIEF.md and ADR 0004)
Each item ships something staff can use on the box.
- [ ] Beach settings (admin: spaces, lines, umbrellas, numbers, sunbeds; editable any time) and
      beach map per date and space, sea at the top
- [ ] Bookings: create and cancel day / multi-day bookings from the map; SpotDay rows make
      double booking impossible (unique constraint + transaction)
- [ ] Quick book: name, phone, umbrellas, sunbeds → suggested spots, one-tap confirm
- [ ] Seasons (admin) and season passes, with released days
- [ ] Move a booking to another spot or dates
- [ ] Check-in and the 11:00 hold rule (no-shows flagged on the map, restore)
- [ ] Date view counts (free / total umbrellas and sunbeds), search by name or phone
- [ ] Live map: changes show on every device within seconds

## Milestone 2 — Business features
- [ ] Prices, payments recorded at the desk, daily cash-up report
- [ ] Regular-customer history (who had which spot last season)
- [ ] Reports for the admin
- [ ] Remote access via Tailscale (ADR 0003)

## Milestone 3 — Release v1.0
- [ ] Security review (security agent) and fixes
- [ ] Accessibility pass
- [ ] Self-hosting docs (Docker)
- [ ] Tag v1.0.0
