# 0004. Booking model: whole days, date ranges, season passes

- Status: Accepted (on merge of this PR)
- Date: 2026-11-10

## Context
Spots are booked by the **full day**, for **several consecutive days**, or for the **whole season**
(season pass). There are no hourly or half-day slots.

## Decision
- A booking covers an **inclusive range of calendar dates** on one spot:
  `start_date`, `end_date` (a one-day booking has start = end). There are no clock times.
- Dates are the club's local calendar dates (venue time zone, `Europe/Rome`), stored as SQL `date`.
  This is an explicit exception to the "store times in UTC" rule, which applies to timestamps
  (created_at, check-in time and similar), not to calendar days.
- `kind`: `day` | `multi_day` | `season`. `season` bookings are linked to a **Season**
  (name, start date, end date per area) and cover it in full by default.
- **No double booking**: a PostgreSQL exclusion constraint on (`spot_id`, `daterange(start_date,
  end_date, '[]')`) for active bookings. A spot cannot have overlapping active bookings,
  including a day booking inside someone's season pass.
- Status: `confirmed` | `cancelled`, plus a per-day **check-in** record (who arrived on which day).
- Every create, move or cancel is written to an audit log (who, when, what changed).

## Consequences
- The map for a given day shows which spots are free or booked, as a single query on the date range.
- Releasing one day of a season pass (holder not coming) needs an explicit "release" feature.
  It is not possible by default. See the open question in PROGRESS.md.
- Prices per kind/season are added later as a separate table, without changing bookings.
