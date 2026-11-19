# 0015. Check-in and the hold job

- Status: Accepted (owner, 2026-11-17)
- Date: 2026-11-17
- Details: carries out the hold rule of [ADR 0004](0004-booking-model.md) and extends the undo of
  [ADR 0013](0013-activity-and-undo.md). Plan: `docs/plans/check-in.md`

## Context
ADR 0004 says today's unclaimed day and multi-day bookings become `no_show` at the hold time
(11:00, or the booking's own `hold_until`), that "a job runs every minute", and that automatic
no-shows are logged as "system". It doesn't say where the job runs, how it avoids racing a
check-in, or how an entry without a user is stored.

## Decision
- `check_in` holds one row per booking per day (it covers all the booking's umbrellas). Staff
  check in, remove a check-in and restore a no-show for **today only**.
- `venue.default_hold_until` (default 11:00). The hold instant of day D is
  `D + hold time` in Europe/Rome, computed in SQL so daylight-saving days are right.
- The job runs inside the app: `src/instrumentation.ts` starts a one-minute timer in the Node
  runtime, with one run at start-up (catch-up after the box was off). A transaction-scoped
  advisory lock makes a second app process skip the run. No extra container.
- Each run flags only **today's** `booked` days of active, non-season bookings whose hold
  instant has passed, that were created before it, and have no check-in. Past days are never
  rewritten. It first locks the bookings `for update skip locked`, then re-checks check-ins in
  a second statement, so a check-in that committed first always wins; a booking skipped while
  locked is flagged on the next run.
- One `no_show` entry per run that flagged something, with no user (`audit_log.user_id` null,
  allowed only for `no_show`), no booking and no change data. The map shows it as "System"; it
  can't be undone: restoring the no-show is the way back.
- Restore of a no-show is all or nothing: every no-show umbrella of the booking that day goes
  back to `booked` and the booking is checked in, or nothing changes and the clashes are shown.
- Check-in, removing it, a hold change and a no-show restore are undoable entries (ADR 0013).
  Their change data also records check-ins and `hold_until`.

## Consequences
- Migration 0009, rolling back only while nothing was checked in or flagged.
- `listActivity` must allow entries with no user; ADR 0013's "user system" is a null user.
- A no-show day is no longer as a `book` entry left it, so that entry can't be undone after the
  no-show (cancel still works).
- Several app processes would each start a timer; the advisory lock keeps runs single.

## Amendment: check in at creation (2026-11-19)
- Creating a day or multi-day booking whose range includes today may check in today as part of
  the same transaction (`checkIn: true`; the server default is `false`). Still one `check_in` row
  per booking per day; later days of a multi-day booking are not checked in.
- The check-in is part of the `book` entry (`change.checkIns`, `detail.checkedIn`), not a separate
  entry. Undoing the `book` entry cancels the booking and removes the check-in; undoing that undo
  restores both. Season passes are unchanged: check-in stays manual.
- The booking form shows a "Check in now" checkbox, ticked by default, only when the range
  includes today.
