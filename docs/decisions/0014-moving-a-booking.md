# 0014. Moving a booking

- Status: Accepted (owner, 2026-11-17)
- Date: 2026-11-17
- Details: extends the booking model of [ADR 0004](0004-booking-model.md) and the undo of
  [ADR 0013](0013-activity-and-undo.md). Plan: `docs/plans/move-booking.md`

## Context
Staff need to move a booking to other umbrellas or dates. Days already used must stay on record
where they were (ADR 0013), so a moved booking can sit on two umbrellas over its life while
staff should see only the one it has now.

## Decision
- `booking_spot.current` marks the booking's umbrellas now. A move keeps the old row (its past
  days point at it) with `current = false`; the panel and the activity list show current rows only.
- A booking that hasn't started may get new umbrellas and new dates. A started booking or a
  season pass only new umbrellas, from a chosen day to its end. The umbrella count stays the
  same; any staff member may move.
- A move is one `move` entry. Only days that change are written; the unique index on booked
  days decides races, as for a new booking.
- Days an earlier move left on a former umbrella follow a one-umbrella booking; with several
  umbrellas the move is refused (`split`).
- Undo of a move restores umbrellas, sunbeds, dates and kind. A date move can't be undone once
  either range has started. An older entry can't be undone while a later move of the booking
  stands: undo the move first.
- Migration 0008 rolls back only while nothing was moved; afterwards restore the backup.

## Consequences
- Every reader of a booking's umbrellas must filter `current`.
- Undo order matters more: staff undo a move before anything older on the same booking.
