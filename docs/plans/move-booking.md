# Plan: Move a booking to another spot or dates (ADR 0004, ADR 0013)

**Goal**: staff move a booking's umbrellas and/or dates from the map in one step; it is logged
as one `move` entry that can be undone.

## Scope
- In: day/multi-day bookings not started yet: new umbrellas and/or a new range (kind recomputed,
  ≤ 60 days, start ≥ today). Started bookings and season passes: new umbrellas from a day F
  (today ≤ F ≤ end) to the end; days before F stay where they were.
- Same number of umbrellas: each current umbrella maps to one target (itself = unchanged; swaps
  within the booking allowed); sunbeds go with it, checked against the target's `max_sunbeds`.
- Out: adding/removing umbrellas, customer details, moving a pass's dates (last day stays with
  "Set last day"), moving to another beach space, check-in/hold (later items).

## Data / migration `0008_booking_move` (up/down)
- Up: `audit_log` action check adds `'move'`; `booking_spot.current boolean not null default true`
  (old umbrellas keep their past days but are no longer the booking's umbrellas).
- Down: raises if any `move` entry or non-current `booking_spot` exists (no silent loss; restore
  the pre-update backup instead); otherwise drops the column and restores the old check.
- Readers filter `current`: `bookings.ts` (Occupant.spots), `audit.ts` (spots).
- A target spot the booking used before reuses its row (`unique (booking_id, spot_id)`), set
  `current` again.

## Server: `moveBooking(db, userId, input, today)` in `src/lib/booking/move.ts`
- Input (zod): `bookingId`, `spots: {fromSpotId, toSpotId}[]` (covers every current umbrella,
  targets distinct), `startDate`/`endDate` (unstarted day bookings) or `fromDate` (others).
- One transaction: lock booking `for update` (active, else `notFound`; end < today → `ended`;
  started/pass with new dates → `started`); target spots `for share`, all in the booking's area
  (else `invalid`); sunbeds fit (else `sunbeds`).
- Compute old vs new day sets per (booking_spot, date). Only the difference is written: delete
  removed rows, then insert added rows ordered `(spot_id, date)`. Days kept on the same spot are
  untouched, so partial overlap with its own days never clashes.
- A released pass day stays `released` on the new umbrella and needs no free target (ADR 0012);
  only `booked` days must be free. Clashes are found before writing (own rows excluded); the
  unique index decides races: 23505/40P01 → `taken`.
- Nothing changes → `unchanged`, no entry. Pure `planMove()` holds the diff (unit-tested).
- Action `moveBookingAction` in `booking-actions.ts` (`readCurrentUser`, `revalidatePath("/")`).

## Audit / undo
- `AuditAction` + `"move"`. `BookingState` gains optional `startDate`, `kind`; `RecordedChange`
  gains optional `spots: {bookingSpotId, before/after: {current, sunbeds}}[]`. Old entries are
  unaffected. Detail: `fromSpots`, `toSpots`, old/new dates. No customer data.
- `undo.ts` restores previous spots/dates, refusing with `taken` + clashes if a former umbrella
  was booked since, or `changed` after a later change.
- Extra rule (within ADR 0013's "past days untouched"): undoing a date move is refused with
  `started` once the old or new range has started; spot-only moves undo from today on.

## UI
- `BookingDetails`: "Move" button while end ≥ today → `MoveForm`.
- Move mode in `BeachBoard`: taps assign the next target to each umbrella (free ones and its own;
  other bookings ignored). Each line shows "101 → 105" with "Keep". Date fields, or "From day"
  (default the later of the shown day and today). Confirm/Cancel. Clashes listed by `ErrorLine`.
- Phone: same panel in the sheet; hint "Tap the new umbrella for 101" in the sticky header.
  Tablet: side panel. Tap targets ≥ 44px. Activity panel: `case "move"`.

## i18n (it + en, parity test)
`booking.move`, `moveTitle`, `moveHint`, `moveTapFor`, `moveFromDay`, `moveArrow`, `moveKeep`,
`moveConfirm`, `moveCancel`, `booking.errors.{unchanged,started,otherArea}`, `activity.move`,
`activity.undo` + `move`, `activity.errors.started`.

## Acceptance criteria (integration `tests/integration/move.test.ts` unless noted)
1. Moving 101→105 for 10–12 frees 101 and books 105 for those days; one `move` entry, one transaction.
2. Double booking: target booked on any day → `taken` with spot/day, nothing changed, no entry.
3. Concurrent: two moves onto the same spot/day (and move vs new booking): exactly one wins; the
   other gets `taken`; no partial rows.
4. Boundaries: 10–12 → 12–14 when another booking ends on 11 or starts on 15 succeeds; one ending
   on 12 clashes. Same spot 10–12 → 11–13 has no self-clash (only 10 removed, 13 added).
5. Swap 101↔102 within the booking succeeds; other area → `invalid`; sunbeds over max →
   `sunbeds`; same spots and dates → `unchanged`, no entry.
6. Start < today or F < today → `past`; started booking with new dates → `started`; cancelled →
   `notFound`; ended → `ended`. Days before F/today keep their spot.
7. Pass moved from F: released days stay released on the new umbrella, are not clash-checked.
8. Undo restores spots, dates, kind, flags and sunbeds; refuses `taken` if 101 was rebooked,
   `changed` after a later change, `started` per rule; undo of the undo re-applies the move.
9. Panel and activity show only current umbrellas after a move (and after move + cancel).
10. Unit: `planMove` diff/overlap cases; schema. E2E `e2e/move.spec.ts`: tablet and `phone`
    move one umbrella and see it on the map. Migration up/down/up test.

## Steps (one commit each)
1. `/checkpoint`; migration 0008 + `db:types`; migration test.
2. `planMove` + unit tests (test first).
3. `moveBooking` + integration tests 1–7, 9.
4. Audit/undo extensions + tests 8.
5. Action, `MoveForm`, move mode, activity text, it/en messages.
6. E2E tablet + phone; ARCHITECTURE.md (BookingSpot `current`).

## Open questions (owner) — recommended default in brackets
- Move several umbrellas onto fewer/more? [No: same count; add/cancel separately.]
- May a pass's first day or a started booking's end move? [No: last day via "Set last day";
  longer stays are a new booking.]
- Who may move: all staff? [Yes, like cancel; undo rules unchanged.]
- Migration down refuses once moves exist? [Yes; rollback = pre-update backup.]
