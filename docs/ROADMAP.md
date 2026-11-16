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
- [x] Interface languages: Italian + English, switchable anytime incl. after login (ADR 0005;
      after login the switcher is in the user menu, ADR 0009)
- [x] Auth (log in, roles, staff accounts) (ADR 0007)
- [x] Umbrella numbering: line × 100 + position, position 1 = leftmost facing the sea (ADR 0004)
- [ ] Android app for club tablets: WebView wrapper that bundles the club's root certificate,
      built on the box by `scripts/build-android.sh`, screen pinning (ADR 0010);
      falls back to the box's Tailscale address off the club network (ADR 0011)
- [ ] Trusted certificate (deferred by ADR 0010; for staff personal phones in a plain browser):
      Let's Encrypt via DNS-01 on the club's own domain (new ADR amending ADR 0008)

## Milestone 1 — Core booking (MVP, PROJECT_BRIEF.md and ADR 0004)
Each item ships something staff can use on the box.
- [x] Beach settings (admin: spaces, lines, umbrellas, numbers, sunbeds; editable any time) and
      beach map per date and space, sea at the top
- [x] Bookings: create and cancel day / multi-day bookings from the map; SpotDay rows make
      double booking impossible (unique constraint + transaction)
- [x] Quick book: name, phone, umbrellas, sunbeds → suggested spots, one-tap confirm
- [x] Seasons (admin) and season passes, with released days
- [ ] Move a booking to another spot or dates
- [ ] Check-in and the 11:00 hold rule (no-shows flagged on the map, restore)
- [ ] Date view counts (free / total umbrellas and sunbeds), search by name or phone
- [ ] Live map: changes show on every device within seconds

## Milestone 2 — Business features
- [ ] Prices, payments recorded at the desk, daily cash-up report. Season passes are paid at the
  end, once the holder knows their last day (owner, 2026-11-14)
- [ ] Regular-customer history (who had which spot last season)
- [ ] Reports for the admin
- [ ] Remote access via Tailscale: box setup, `.env` addresses, RUNBOOK steps (ADR 0003, ADR 0011)

## Milestone 3 — Release v1.0
- [ ] Security review (security agent) and fixes
- [ ] Accessibility pass
- [ ] Self-hosting docs (Docker)
- [ ] Tag v1.0.0
