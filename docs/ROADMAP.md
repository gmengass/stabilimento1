# Roadmap

One item = one branch = ideally one session. Tick items when merged.
Draft milestones below. Adjust them after PROJECT_BRIEF.md is filled in.

## Milestone 0 — Foundations
- [x] Repo, license, agents, workflow docs
- [x] Confirm tech stack (ADR 0002 → Accepted)
- [x] Hosting decision (ADR 0003)
- [x] Scaffold app, lint/format, test runner, CI green
- [ ] Deploy: Docker Compose stack (app, PostgreSQL, Caddy), update/rollback scripts, RUNBOOK (ADR 0003)
- [ ] Backups: nightly encrypted pg_dump to USB + OneDrive (rclone), retention, restore test, failure alert
- [x] Database + first migration (Venue, Area, Spot), seed data
- [x] Interface languages: Italian + English, switchable anytime incl. after login (ADR 0005)
- [x] Auth (log in, roles, staff accounts) (ADR 0007)

## Milestone 1 — Core booking (MVP)
- [ ] Bookable resources/services (CRUD for providers)
- [ ] Availability rules (working hours, breaks, exceptions)
- [ ] Availability search (customer side)
- [ ] Create booking with double-booking protection (DB constraint + transaction)
- [ ] View / cancel / reschedule booking
- [ ] Email confirmations and reminders

## Milestone 2 — Business features
- [ ] Payments / deposits
- [ ] Provider dashboard and calendar view
- [ ] Calendar sync (iCal / Google)
- [ ] Admin panel

## Milestone 3 — Release v1.0
- [ ] Security review (security agent) and fixes
- [ ] Accessibility pass
- [ ] Self-hosting docs (Docker)
- [ ] Tag v1.0.0
