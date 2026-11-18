# 0016. Day counts and booking search

- Status: Accepted (owner, 2026-11-18)
- Date: 2026-11-18
- Details: carries out the "date view" of [ADR 0004](0004-booking-model.md). Plan:
  `docs/plans/date-view-counts.md`

## Context
ADR 0004 asks for free / total umbrellas and sunbeds on any date, and staff need to find a
customer's booking without scanning the map. The data has no physical sunbed stock, and search
lists customer names and phones (personal data, GDPR question still open).

## Decision
- Counts come from `spot_day` only: a spot is taken by a `booked` day. No-shows and released days
  nobody rebooked are free. An umbrella holds its `included_sunbeds` (not the number booked on
  it); a standalone sunbed spot is one sunbed. Totals use today's layout.
- Search covers active bookings with `end_date >= today`, at most 20, by name (case-insensitive
  substring, LIKE wildcards literal) or by phone digits. No index or migration.
- It is a GET form to `/search` (works without JavaScript, Back returns to it). Caddy deletes `q`
  from the access log, so names and phones never land in logs.
- A result opens `/?area=&date=&booking=`: the viewed day if the booking is on the map then, else
  its next `booked` day or a `no_show` nobody rebooked (to restore it), else today with a note.

## Consequences
- Past and cancelled bookings can't be searched until the GDPR retention decision.
- "Nicolò" isn't found by "nicolo": accent-insensitive search needs `unaccent` (a migration).
- Search has no rate limit yet, like the other actions listed in `docs/PROGRESS.md`.
