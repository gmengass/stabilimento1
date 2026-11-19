# 0020. Deckchairs per booking

- Status: Accepted (owner, 2026-11-19); the "No stock" bullet is superseded by [ADR 0021](0021-sunbed-deckchair-stock.md)
- Date: 2026-11-19
- Adds to: [ADR 0004](0004-booking-model.md) §Bookings (sunbeds per umbrella are unchanged)

## Context
Every booking keeps its sunbeds (lettini), 2 per umbrella by default. Some customers also want a
deckchair (sdraio). Staff need to record that on the booking so it is set out on the day.

## Decision
- **Per booking**: `booking.deckchairs`, a whole number, default **0**. It is a request attached
  to the booking, not a spot on the map.
- **Cap**: at most **2 per umbrella** in the booking (`MAX_DECKCHAIRS_PER_UMBRELLA` in
  `src/lib/beach/limits.ts`). The database check (`0..40`) is a backstop only.
- **No stock**: the club's number of deckchairs is not tracked, so day counts show no free/total
  deckchairs. Deckchairs don't count toward an umbrella's `max_sunbeds`.
- Set when a booking or season pass is created (booking form, quick book). Moves keep the number
  of umbrellas, so they keep the count; undo cancels or restores the whole booking with it.
- The booking details show the count when it is above 0; the activity entry for the booking
  mentions it.

## Consequences
- Changing deckchairs on an existing booking is not possible yet (follow-up item: an audited,
  undoable edit).
- If the club later wants a stock limit, a venue setting and a per-day count can be added
  without changing this column.
