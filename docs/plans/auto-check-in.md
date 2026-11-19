# Plan: check in at creation (walk-ins)

Amends [ADR 0015](../decisions/0015-check-in-and-hold-job.md). Builds on `docs/plans/check-in.md`.

## Behaviour
- A booking whose range includes today can be checked in for today when it is created.
- The booking panel and the quick-book confirm step show a "Check in now" checkbox, only when
  the range includes today, ticked by default. Staff can untick it.
- The server default is `false` when the field is missing, so API and test callers don't change.
  The UI sends `true` explicitly.
- Only today's day is checked in. Later days of a multi-day booking stay `booked` (11:00 rule).
- A range that starts in the future or ended in the past ignores the flag.
- Season passes are out of scope: they are exempt from the hold rule, check-in stays manual.

## Design
- `createSchema` (`src/lib/booking/bookings.ts`) gets `checkIn: z.boolean().default(false)`.
- `insertBooking` inserts one `check_in` row for today in the booking's own transaction, when
  the flag is set and `startDate <= today <= endDate`.
- The check-in is part of the `book` audit entry: `change.checkIns = [{date, before: false,
  after: true}]` and `detail.checkedIn = 1`. One activity line, atomic.
- Undo of such a `book` entry cancels the booking and removes the check-in through the existing
  `applyCheckIns` / `checkInsAsLeft` in `undo.ts`; no code change expected, only tests.
- ADR 0015 gets a short amendment (no new ADR): creation may check in today inside the `book`
  entry; still one row per booking per day.

## Acceptance criteria
1. Create for today with `checkIn` on: one `check_in` row; the hold run at 11:00 doesn't flag it.
2. `checkIn` off or missing: no row.
3. Future range: flag ignored, no row. A past start is refused as `past` before anything else.
4. Multi-day including today: exactly one row (today).
5. Create that fails with `taken`: no `check_in` row.
6. One audit entry; undo removes the booking and the check-in; undo of the undo restores both.
7. UI: checkbox hidden unless the range includes today; ticked by default.
8. i18n parity: `booking.checkInNow`, `activity.book.checkedIn` in `it` and `en`.

## Files
`src/lib/booking/bookings.ts`, `src/lib/booking/check-in.ts` (export the insert),
`src/app/(app)/booking-actions.ts` (pass the field), `booking-panel.tsx` (quick book opens the same form with its suggested
umbrellas, so it needs no change), `messages/it.json`, `messages/en.json`, `activity-panel.tsx`, ADR 0015, `docs/ARCHITECTURE.md`.

## Open question
Visible, ticked-by-default checkbox (assumed) versus silent auto check-in with no choice.
