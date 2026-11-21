# Roadmap

One item = one branch = ideally one session. Tick items when merged.
Draft milestones below. Adjust them after PROJECT_BRIEF.md is filled in.

## Milestone 0 — Foundations
- [x] Repo, license, agents, workflow docs
- [x] Confirm tech stack (ADR 0002 → Accepted)
- [x] Hosting decision (ADR 0003)
- [x] Scaffold app, lint/format, test runner, CI green
- [x] Deploy: Docker Compose stack (app, PostgreSQL, Caddy), update/rollback scripts, RUNBOOK (ADR 0003)
- [x] Backups: nightly encrypted pg_dump to box disk + OneDrive (rclone), 14 days, restore test,
      failure alert (owner, 2026-11-19, ADR 0022)
- [x] Database + first migration (Venue, Area, Spot), seed data
- [x] Interface languages: Italian + English, switchable anytime incl. after login (ADR 0005;
      after login the switcher is in the user menu, ADR 0009)
- [x] Auth (log in, roles, staff accounts) (ADR 0007)
- [x] Umbrella numbering: line × 100 + position, position 1 = leftmost facing the sea (ADR 0004)
- [x] Android app for club tablets: WebView wrapper that bundles the club's root certificate,
      built on the box by `scripts/build-android.sh`, screen pinning (ADR 0010);
      falls back to the box's Tailscale address off the club network (ADR 0011)
- [x] Communal accounts for shared tablets: a staff account flagged communal, "who is doing this?"
      pop-up on the first action and after 2 minutes idle, actions recorded under the person
      chosen (owner, 2026-11-20, ADR 0025)
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
- [x] Activity stream: last 10 actions on the map, undo (own 30 min, admin any) (ADR 0013)
- [x] Move a booking to another spot or dates
- [x] Check-in and the 11:00 hold rule (no-shows flagged on the map, restore) (ADR 0015)
- [x] Date view counts (free / total umbrellas and sunbeds), search by name or phone
- [x] Live map: changes show on every device within seconds (ADR 0019)
- [x] Phone layout: the booking panel as a bottom sheet over the map on narrow screens, larger
      tap targets, phone-width e2e tests for booking and quick book (owner, 2026-11-16)
- [x] Light / dark theme in the user menu, per device (owner, 2026-11-18, ADR 0017)
- [x] Map header: date on the Today button, no space name or date title above the map (owner,
      2026-11-18)
- [x] Admin sets the check-in time for day bookings in Beach settings (owner, 2026-11-18,
      ADR 0018)
- [x] Deckchairs: a booking keeps its sunbeds (2 per umbrella by default) and can add up to 2
      deckchairs (sdraie) per umbrella (owner, 2026-11-19, ADR 0020)
- [x] Sunbed and deckchair stock in Beach settings: free / stock per day, warning before a
      booking goes over (owner, 2026-11-19, ADR 0021)
- [x] Map tiles show sunbeds and deckchairs beyond the default: `+L`, `-L`, `+S` (owner,
      2026-11-19, ADR 0023)
- [x] Check in at creation: a one-day booking for today can be checked in as it is made
      (owner, 2026-11-19, ADR 0015 amendment)
- [x] Activity stream and undo cover the whole day, not only the last 10 entries (owner,
      2026-11-20, ADR 0024)
- [x] Sunbed and deckchair stock per beach space, entered in each space's panel in Beach settings
      (owner, 2026-11-20, ADR 0026, PR #77)

## Milestone 2 — Business features
- [ ] Prices, payments recorded at the desk, daily cash-up report. Season passes are paid at the
  end, once the holder knows their last day (owner, 2026-11-14)
- [ ] Regular-customer history (who had which spot last season)
- [ ] Reports for the admin
- [ ] Remote access via Tailscale: box setup, `.env` addresses, RUNBOOK steps (ADR 0003, ADR 0011)

## Milestone 3 — Release v1.0
- [ ] Security review (security agent) and fixes
- [x] Accessibility pass: keyboard, contrast, focus, target size, zoom; screen readers out of scope
      (owner, 2026-11-21, PR #80)
- [ ] Self-hosting docs (Docker)
- [ ] Tag v1.0.0
