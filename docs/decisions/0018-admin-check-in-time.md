# 0018. Admins set the check-in time for day bookings

- Status: Accepted
- Date: 2026-11-18 (owner request)
- Amends: [ADR 0004](0004-booking-model.md) (hold rule) and [ADR 0015](0015-check-in-and-hold-job.md)

## Context
ADR 0004 fixed the venue's `default_hold_until` at 11:00 and ADR 0015 stored it on `venue`,
but nobody could change it without SQL. The owner asked for an admin setting.

## Decision
- **Beach settings** (admin only) gets a "Check-in by" time field, next to the club name. It
  sets `venue.default_hold_until` (any `HH:MM`; 11:00 stays the default for new venues).
- It applies to day and multi-day bookings with no hold time of their own, from the job's next
  run. A late-arrival time stays first. Season passes stay exempt.
- A hold stored as "none" because it equalled the usual time (ADR 0015) follows the new time.
- Days already flagged `no_show` are never rewritten (ADR 0015): moving the time later
  doesn't bring them back; staff restore them. Moving it earlier flags today's unclaimed
  bookings made before the new instant at the next run.
- The change is logged as a "beach" activity entry like other settings; it can't be undone
  there (ADR 0013).

## Consequences
- No migration: the column exists since 0009.
- The no-show text "not here by {time}" shows the current time, so a no-show from before a
  change shows the new time (open question).
