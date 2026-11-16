# 0012. Quick book: suggestion order, season passes and past dates

- Status: Accepted (owner, 2026-11-16)
- Date: 2026-11-16
- Details: the "Quick book" part of [ADR 0004](0004-booking-model.md)

## Context
Staff at the desk need to book a group fast: name, optional phone, how many umbrellas and sunbeds,
and when. The app should pick the umbrellas, and staff confirm with one tap. ADR 0004 names the
inputs but leaves open which umbrellas to suggest, whether passes are included, and past dates.

## Decision
- Suggestions come from one beach space (the one on the map) and only from umbrellas free on every
  day of the request. A released season-pass day counts as free.
- Order: side by side in one line, nearest the sea first, then leftmost; then the closest umbrellas
  in one line (smallest gap); then the closest across lines. Only groups that can hold all the
  sunbeds are offered, which are spread evenly, the leftmost taking the remainder. Up to 5.
- Quick book only suggests. Confirming goes through the normal booking or season-pass action, so
  the unique index on `spot_day` still decides a race between two desks (ADR 0004).
- Quick book also sells season passes: the request runs from the first day to the season's end.
- Day and multi-day bookings can no longer start before today, from quick book or from the map.
  Season passes keep their own rule (from yesterday on, for a holder who arrived yesterday);
  quick book starts passes today at the earliest.

## Consequences
- No migration: the feature is a read-only query, a pure function and UI.
- Staff can still change the suggestion on the map before confirming.
- Fixing a past booking now needs a new rule (e.g. an admin correction) when it comes up.
