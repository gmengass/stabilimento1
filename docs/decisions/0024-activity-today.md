# 0024. Activity stream and undo cover the whole day

- Status: Accepted (owner, 2026-11-20)
- Date: 2026-11-20
- Amends: [ADR 0013](0013-activity-and-undo.md) (only the "10 latest entries" rule)

## Context
At a busy desk more than 10 actions happen quickly, so a mistake made earlier in the day could
no longer be seen or undone. The owner wants the stream and undo to reach back to the start of
the day.

## Decision
- The map lists every entry since the start of today, newest first. "Today" is the venue-local
  day ([ADR 0004](0004-booking-model.md)); the UTC cut-off is computed at the edge and is
  DST-safe (days of 23 or 25 hours).
- Undo is allowed for any entry from today. All other rules of ADR 0013 stay: author within
  30 minutes or admin at any time, not undone yet, the booking and every day the change touched
  as that change left them (a later change to the same days is undone first), the booking still
  has days from today on, every umbrella it would book again free, and undo writes its own entry.
- An undo entry made today can be undone even when the entry it undid is older.
- The list shows at most 500 entries, newest first, with a note when the cap is hit. The cap
  only limits the display; undo eligibility depends on "today", not on the cap.
- After midnight the list starts empty at the next refresh, as the map does. An undo clicked
  on an entry from the previous day reports it is no longer available and changes nothing.

## Consequences
- No migration for the decision itself: `audit_log.created_at` already exists. Migration `0016`
  later indexes it, so the list doesn't read the whole log on every map load.
- Retention of the log stays part of the open GDPR question.
