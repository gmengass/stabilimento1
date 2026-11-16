# Plan: activity stream and undo (ADR 0013)

## Acceptance criteria
1. Every book, season-pass sale, cancel, last-day change, release and restore writes one
   `audit_log` row in its own transaction; a failed change writes none.
2. Beach-settings and season changes appear in the stream and cannot be undone.
3. The map shows the 10 latest entries: who, what, which booking (name, umbrellas, dates), when.
4. Staff can undo their own entries for 30 minutes; admins any of the 10 latest; the server
   enforces it, not just the button.
5. Undo refuses, changing nothing, when the booking changed since, an umbrella it would book again
   is taken, or the entry was already undone (also when two people undo at once).
6. Undo never touches days before today. An undo is itself an entry that can be undone.

## Steps
1. Migration `0007_audit_log` (up/down), regenerate `src/db/types.ts`.
2. `src/lib/booking/audit.ts`: entry writer, change type, `listActivity`, `undoEntry`, `mayUndo`.
3. Record changes in `bookings.ts` and `passes.ts`; pass the user id to the pass day functions.
4. Log admin beach/season actions in their `asAdmin` wrappers.
5. `undoAction` server action; `ActivityPanel` under the map; it/en messages.
6. Tests: integration (logging, undo of each action, permissions, conflicts, double undo,
   past days, undo of undo), unit (action guard, `mayUndo`), e2e smoke only if cheap.
