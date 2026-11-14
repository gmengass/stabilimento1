# Plan: Seasons (admin) and season passes, with released days

Roadmap: Milestone 1. Branch: `feat/season-passes`. Model: ADR 0004.

## Goal
Admins define seasons. Staff sell a season pass from the map, release days of a pass, and give a
released day back while the umbrella is still free.

## Decisions (confirmed by the owner, 2026-11-13, unless marked)
- One season per **calendar year**, belonging to the venue and covering every beach space. It
  starts and ends in the same year; a unique index on (venue, year) enforces one per year.
  The club's usual season is 1 May – 30 September: the "New season" form pre-fills it for the
  next year without a season (any dates are still allowed).
- At most **one open season** (owner: staff must never see next year's season early). The next
  season can only be added once the current one has ended (the day after its last day); the
  admin page hides the form until then, and staff only ever see the open season.
- A pass needs a **first day**; its **last day is optional**. Left empty, the pass runs to the
  season's last day. When the holder knows their last day, staff set it from the pass and every
  later day is freed. A pass can only be shortened, and not to before yesterday.
- Release and restore apply to **every umbrella of the pass** for a date range. Past days can't
  be released or restored; today can.
- Once any pass exists, even a cancelled one, the season's dates are fixed and it can't be
  removed. Its name can still change.
- (Not confirmed) Any staff member can sell, release, restore and end a pass; only admins manage
  seasons.
- Nothing is sold or changed in the past: a pass for an ended season is refused, a pass starts no
  earlier than yesterday, release and restore from today, a last day no earlier than yesterday,
  and an admin can't add a season that has already ended. The panel forms use the same limits.

## Acceptance criteria (`tests/integration/seasons.test.ts`)
1. Season create/update/remove with validation, one season per year (two created at once for
   the same year: exactly one succeeds), unique name.
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
8. A pass without a last day runs to the season's end; with one, it ends that day (inclusive).
   Setting the last day later frees every later day, released ones included, and can't extend.

## Data changes
Migration `0006_seasons`: table `season` (venue, name, start_date, end_date, one per year),
`booking.season_id` with `check ((kind = 'season') = (season_id is not null))`. Down turns
passes into day or multi-day bookings (keeping their days) and drops both.

## Files
- `src/lib/booking/seasons.ts`, `src/lib/booking/passes.ts`; `bookings.ts` shares its insert path
  (`bookSpots`) and loads released days (`loadReleased`).
- `/admin/seasons` (page, forms, actions); map legend, violet pass colour, dashed released spots;
  booking panel: season-pass tick box, release form, "give it back" on a released spot.

## Not in this item
- AuditLog entries for release/restore (the table doesn't exist yet; open question in PROGRESS).
- Releasing a single umbrella of a multi-umbrella pass (owner: fine as is).
- Extending a pass past its last day (book the extra days separately).
- Prices and payment for passes (Milestone 2). The owner's rule: a pass is paid at the end, when
  the holder knows their last day, so payment will hang off "set the last day".
