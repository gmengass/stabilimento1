# 0013. Activity stream and undo

- Status: Accepted (owner, 2026-11-16); the "10 latest" rule is amended by [ADR 0024](0024-activity-today.md)
- Date: 2026-11-16
- Details: implements the AuditLog of [ADR 0004](0004-booking-model.md) and adds undo

## Context
Staff at a busy desk make mistakes: the wrong umbrella, the wrong pass cancelled, days released
for the wrong holder. They want to see the last few actions on the map and undo a mistake with
one tap. ADR 0004 already requires an AuditLog for every booking change but says nothing about
undo.

## Decision
- `audit_log` gets one row per change: who, when (UTC), action, booking, and the exact change.
  Booking and pass changes (book, sell a pass, cancel, set last day, release, restore) write it
  in the same transaction as the change. Changes to beach settings and seasons are logged after
  they succeed, without change data: they can be seen but not undone.
- The change records the booking's status and end date before and after, and the `spot_day` rows
  it added, removed or moved between `booked` and `released`. No customer data is copied into the
  log; names are read from the booking, so redaction (open GDPR question) stays in one place.
- The map shows the 10 latest entries for the whole venue.
- Undo applies the recorded change in reverse, in one transaction, and only:
  - for one of the 10 latest entries, not undone yet;
  - by its author within 30 minutes, or by an admin at any time;
  - while the booking's status and end date, and every day the change touched, are as that
    change left them (a later change to the same days must be undone first; one to other days of
    the same pass need not be);
  - while the booking still has days from today on;
  - if every umbrella it would book again is still free (otherwise nothing changes, and the
    clashing umbrellas and days are shown). The unique index on `spot_day` decides a race.
- Days before today are never touched by an undo, so days already used stay on record.
- Undo writes its own entry pointing at the original, so an undo can be undone the same way;
  undoing an undo marks the original as standing again.
- Logging beach and season changes is best effort: if the log write fails after the change was
  saved, the change still counts as done and the failure goes to the server log.

## Consequences
- Migration 0007 (with a down path that drops the log).
- `releaseDays`, `restoreDays` and `endSeasonPass` now take the user id, like the other changes.
- The log grows with every action; retention is part of the open GDPR question.
- Automatic no-shows (later item) will log as user "system" and need their own undo rule.
