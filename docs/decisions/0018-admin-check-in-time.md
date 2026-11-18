# 0018. Admins set the check-in time for day bookings

- Status: Accepted (owner, 2026-11-18)
- Date: 2026-11-18
- Amends: [ADR 0004](0004-booking-model.md) (hold rule) and [ADR 0015](0015-check-in-and-hold-job.md)

## Context
ADR 0004 fixed the venue's `default_hold_until` at 11:00 and ADR 0015 stored it on `venue`,
but nobody could change it without SQL. The owner asked for an admin setting.

## Decision
- **Beach settings** (admin only, checked in the server action) gets a "Check-in by" time,
  next to the club name. It sets `venue.default_hold_until` (any `HH:MM`; 11:00 stays the
  default for new venues).
- It applies to day and multi-day bookings with no hold time of their own, from the job's next
  run. A booking's own `hold_until` still wins, as today. Season passes stay exempt.
- A hold stored as "none" because it equalled the usual time (ADR 0015) follows the new time.
- The job's rules don't change: only today, only bookings made before the hold instant, and
  days already flagged `no_show` are never rewritten. So moving the time later doesn't bring
  no-shows back (staff restore them), and moving it earlier flags today's unclaimed bookings
  made before the new instant at the next run.
- Moving it earlier to a time already past today asks for a second "Save anyway", with a
  warning that unclaimed bookings will be freed within a minute.
- The change is a "beach" activity entry with the old and new time ("set the check-in time to
  12:00 (was 11:00)"); it can't be undone there (ADR 0013).

## Consequences
- No migration: the column exists since 0009.
- The booking panel's "Usual time" now shows the venue's time, not the booking's own.
- The no-show text "not here by {time}" shows the time in force now, not when the day was
  flagged (open question in PROGRESS.md).
