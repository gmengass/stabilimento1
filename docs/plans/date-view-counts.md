# Plan: Date view counts, search by name or phone

Goal: for any date and space, staff see free / total umbrellas and sunbeds, and can find an active
booking by customer name or phone and jump to it on the map (ADR 0004 "Date view"). No migration.

## Acceptance criteria
- Any date shows "Umbrellas free X / N" and "Sunbeds free Y / T" for the space shown.
- An umbrella is taken only with a `booked` SpotDay that date; released and no-show days not
  rebooked are free; a rebooked one counts once. Late holds, check-ins and passes (except
  released days) are taken. Counting uses spot_day, never booking_spot (moves are correct).
- Free sunbeds = included sunbeds of free umbrellas + free standalone sunbeds (owner default).
- Search matches name (case-insensitive substring) or phone (digits only, so "333 12" and
  "+39 333…" match). Active bookings with `end_date >= today` only, max 20, soonest first.
- A result shows name, phone, kind, dates, space, umbrella numbers, today's state; tapping it
  opens `/?area=A&date=D&booking=ID` with the panel open. D = viewed date if booked then, else its
  next booked day; none left → today with a note.
- Queries under 2 letters / 3 digits show a hint. `%`, `_`, `\` match literally.
- it + en for all new text; 44px targets; works at phone width.

## Files
- New: `src/lib/booking/counts.ts`, `src/lib/booking/search.ts`, `src/app/(app)/day-counts.tsx`,
  `src/app/(app)/search/page.tsx`, `src/components/booking-search.tsx`.
- Changed: `src/app/(app)/page.tsx` (counts, `booking` param, search box), `beach-board.tsx`
  (`initialBooking`), `messages/{it,en}.json`, `docs/ARCHITECTURE.md`.
- Tests: `tests/integration/day-counts.test.ts`, `tests/integration/booking-search.test.ts`,
  `tests/unit/search-query.test.ts`, `e2e/search.spec.ts`.

## Out of scope
Live updates, all-space totals, past/cancelled search, accent-insensitive search (`unaccent`
needs a migration), spot closures, reports.
