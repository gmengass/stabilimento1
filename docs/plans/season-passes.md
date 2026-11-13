# Plan: Seasons (admin) and season passes, with released days

Roadmap: Milestone 1. Branch: `feat/season-passes`. Model: ADR 0004.

## Goal
Admins define seasons. Staff sell a season pass from the map, release days of a pass, and give a
released day back while the umbrella is still free.

## Decisions (not in an ADR; change here if the owner disagrees)
- A season belongs to the **venue** and covers every beach space (ARCHITECTURE.md said "area").
  Seasons of the venue never overlap, so a day belongs to at most one season.
- A pass always runs to the season's last day. Its first day defaults to the day shown on the map,
  clamped to the season (ADR 0004: "can be later than the opening day").
- Once any pass exists (even cancelled) the season's dates are fixed and it can't be removed.
  Its name can still change.
- Release and restore apply to **every umbrella of the pass** for a date range. Past days can't
  be released or restored; today can.
- Any staff member can sell, release and restore; only admins manage seasons.

## Acceptance criteria (`tests/integration/seasons.test.ts`)
1. Season create/update/remove with validation, the overlap rule (boundaries included), unique
   name, and two overlapping seasons created at once: exactly one succeeds.
2. A pass writes one `booked` spot_day per umbrella per day, all or nothing, and names clashes.
   Two passes for the same umbrella at once: exactly one wins.
3. A pass can never lie outside its season, even if an admin moves the dates at the same moment
   (the insert share-locks the season row).
4. Release turns `booked` into `released` (inclusive range, counted once per day); another
   booking can then take that day and only that day.
5. Restore succeeds only if every umbrella is still free on every day; a restore racing a new
   booking leaves exactly one `booked` row.
6. The released-day count comes from spot_day rows (ADR 0004).
7. Cancelling a pass frees its booked and released days from today on.

## Data changes
Migration `0006_seasons`: table `season` (venue, name, start_date, end_date), `booking.season_id`
with `check ((kind = 'season') = (season_id is not null))`. Down drops both.

## Files
- `src/lib/booking/seasons.ts`, `src/lib/booking/passes.ts`; `bookings.ts` shares its insert path
  (`bookSpots`) and loads released days (`loadReleased`).
- `/admin/seasons` (page, forms, actions); map legend, violet pass colour, dashed released spots;
  booking panel: season-pass tick box, release form, "give it back" on a released spot.

## Not in this item
- AuditLog entries for release/restore (the table doesn't exist yet; open question in PROGRESS).
- Releasing a single umbrella of a multi-umbrella pass; shortening a pass.
- Prices for passes (Milestone 2).
