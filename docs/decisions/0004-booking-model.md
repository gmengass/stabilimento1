# 0004. Booking model: whole days, per-day occupancy, season passes with released days

- Status: Accepted (on merge of this PR)
- Date: 2026-11-10

## Context
- Spots are booked by the **full day**, for **several consecutive days**, or for the **whole
  season** (season pass). There are no hourly or half-day slots.
- A season-pass holder can **release** days they won't use, so staff can sell those days to others.
- Staff need a **quick book**: name, phone, number of umbrellas and number of sunbeds, and the
  system finds the spots.
- Staff need a **date view**: pick any date and see how many umbrellas and sunbeds are free, and
  which rows they're in.

## Decision
### Things that can be booked
- **Spot**: a position in a **row** of an **area**. Two kinds:
  - `umbrella`: an umbrella position with `included_sunbeds` (e.g. 2) and `max_sunbeds`.
  - `sunbed`: a standalone sunbed position (no umbrella), if the club has them.
- Each spot has a row label and a position number, so it can be drawn on the map.

### Bookings
- **Booking**: one customer (name, phone), `kind` (`day` | `multi_day` | `season`),
  `start_date`, `end_date` (inclusive local dates, `Europe/Rome`), status, notes.
- **BookingSpot**: which spots a booking uses, and how many sunbeds go with each umbrella.
  One booking can hold several umbrellas (e.g. a family with 2 umbrellas + 5 sunbeds).

### Occupancy: one row per spot per day
- **SpotDay** (`spot_id`, `date`, `booking_spot_id`, `state`), with a **unique constraint on
  (`spot_id`, `date`)** for occupied states. The database makes double booking impossible.
- Creating a booking inserts one SpotDay per spot per date in one transaction. If any day is
  taken, the whole booking fails and staff see which spot and day clashed.
- `state`: `booked` | `released` (a season holder gave the day back).
  A `released` day doesn't count as occupied, so a day booking can be made on it. If the holder
  changes their mind, the day can be un-released only while it's still free.
- Scale check: 200 spots × 120 season days ≈ 24k rows a season. Trivial for PostgreSQL.
- This replaces the date-range exclusion constraint. Per-day rows make releasing, the date view
  and counts simple queries.

### Quick book
- Inputs: customer name, phone, date(s) or season, number of umbrellas, number of sunbeds.
- The system **suggests** spots: free umbrellas side by side in the same row first, with
  sunbeds spread across them up to `max_sunbeds`, and any remainder on standalone sunbeds.
- Staff confirm in one tap, or tap a different spot on the map before confirming.

### Date view
- For any date: totals (umbrellas free / total, sunbeds free / total) and a **map by row**,
  colored by state: free, booked, season pass, season released (available), checked in.
- It updates live across devices (ADR 0003).

### Also
- **CheckIn** per booking per day. **AuditLog** for every create, move, cancel, release and
  un-release (who, when, before/after).
- Timestamps are UTC; booking days are local `date`s.

## Consequences
- Moving a booking means rewriting its SpotDay rows in one transaction.
- Shortening a season pass or cancelling part of a range is the same operation (delete those rows).
- Prices per kind/season are added later as a separate table, without changing this model.
