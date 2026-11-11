# 0004. Booking model: whole days, per-day occupancy, season passes, 11:00 hold rule

- Status: Accepted (on merge of this PR)
- Date: 2026-11-10

## Context
- Spots are booked by the **full day**, for **several consecutive days**, or for the **whole
  season** (season pass). There are no hourly or half-day slots.
- A season-pass holder can **release** days they won't use, so staff can sell those days to others.
- Staff need a **quick book**: name, phone, number of umbrellas and number of sunbeds, and the
  system finds the spots.
- Staff need a **date view**: pick any date and see how many umbrellas and sunbeds are free, and
  which lines they're in.
- Umbrellas stand in **lines**. Line 1 is closest to the shore.
- Standard is **2 sunbeds per umbrella, maximum 3**.
- Unclaimed day and multi-day reservations free up at **11:00** unless the customer said they'd
  arrive late. Season passes are exempt.

## Decision
### Things that can be booked
- **Line**: a line of umbrellas in an area, numbered from the shore (line 1 = closest to the sea).
- **Spot**: a position in a line. Two kinds:
  - `umbrella`: `included_sunbeds` (default **2**) and `max_sunbeds` (default **3**). Both can be
    set per umbrella if some differ.
  - `sunbed`: a standalone sunbed position with no umbrella. Supported, but none at launch.
- Each spot has a line and a position number, so it can be drawn on the map.

### Bookings
- **Booking**: one customer (name, phone), `kind` (`day` | `multi_day` | `season`),
  `start_date`, `end_date` (inclusive local dates, `Europe/Rome`), status, notes,
  `hold_until` (optional local time, see the hold rule).
- **Season pass** = a booking with `kind = season`. `start_date` is stored as the pass holder's
  **first day**, which can be later than the season's opening day. `end_date` defaults to the
  season's last day. The **number of released days** is shown on the pass and in reports. It is
  counted from SpotDay rows (`state = released`), so it can never drift out of sync.
- **BookingSpot**: which spots a booking uses, and how many sunbeds go with each umbrella.
  One booking can hold several umbrellas (e.g. a family with 2 umbrellas + 5 sunbeds,
  i.e. 3 + 2, within each umbrella's max of 3).

### Occupancy: one row per spot per day
- **SpotDay** (`spot_id`, `date`, `booking_spot_id`, `state`), with a **unique constraint on
  (`spot_id`, `date`)** for occupied states. The database makes double booking impossible.
- Creating a booking inserts one SpotDay per spot per date in one transaction. If any day is
  taken, the whole booking fails and staff see which spot and day clashed.
- `state`:
  - `booked`: occupied.
  - `released`: a season holder gave the day back in advance.
  - `no_show`: not checked in by the hold time (see below).
  Only `booked` counts as occupied, so a new booking can be made on a released or no-show day.
  A released or no-show day can be restored only while the spot is still free that day.
- Scale check: 200 spots × 120 season days ≈ 24k rows a season. Trivial for PostgreSQL.
- This replaces the date-range exclusion constraint. Per-day rows make releasing, the date view
  and counts simple queries.

### Hold rule (11:00)
- Venue setting `default_hold_until` = **11:00** (local time). It applies to **day and multi-day
  bookings**. **Season passes are exempt**: their spots are never freed automatically, only by
  releasing days.
- Each booking can override it with `hold_until` (e.g. 13:30) when the customer has said
  they'll be late. The override applies to all of its days, or can be set for a single day.
- At the hold time, today's `booked` SpotDays (non-season) with no check-in become `no_show`.
  A job runs every minute and writes an AuditLog entry. The spot becomes bookable again.
- **No-show spots stay flagged on the map**: a distinct color with the original customer's
  name and "no-show 11:00", so staff recognize a latecomer at a glance. Staff can rebook the spot.
  The map then shows the new booking, with a small marker that opens the no-show's details.
- If the customer arrives later: if the spot is still free, staff tap "restore" (back to `booked`
  plus check-in); otherwise they quick-book them another spot.

### Quick book
- Inputs: customer name, phone, date(s) or season, number of umbrellas, number of sunbeds.
- The system **suggests** spots: free umbrellas side by side in the same line first, with
  sunbeds spread across them up to `max_sunbeds`, and any remainder on standalone sunbeds.
- Staff confirm in one tap, or tap a different spot on the map before confirming.

### Date view
- For any date: totals (umbrellas free / total, sunbeds free / total) and a **map by line**,
  colored by state: free, booked, season pass, released (available), no-show (available, shows the
  original name), checked in. Late-arrival holds show their time (e.g. "hold 13:30").
- It updates live across devices (ADR 0003).

### Also
- **CheckIn** per booking per day. **AuditLog** for every create, move, cancel, release,
  restore, hold change and automatic no-show (who or "system", when, before/after).
- Timestamps are UTC; booking days are local `date`s.

## Consequences
- Moving a booking means rewriting its SpotDay rows in one transaction.
- Shortening a season pass or cancelling part of a range is the same operation (delete those rows).
- Prices per kind/season are added later as a separate table, without changing this model.
