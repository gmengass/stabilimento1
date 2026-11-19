# 0021. Sunbed and deckchair stock

- Status: Accepted (owner, 2026-11-19: "count and warn")
- Date: 2026-11-19
- Supersedes: the "No stock" bullet of [ADR 0020](0020-deckchairs.md). Everything else in 0020
  and the per-umbrella sunbed limits of [ADR 0004](0004-booking-model.md) are unchanged.

## Context
The club owns a fixed number of lettini (sunbeds) and sdraie (deckchairs) for the whole beach.
Umbrellas can take an extra sunbed (up to `max_sunbeds`) and bookings can ask for deckchairs,
so on a busy day the desk can promise more than the club has. The owner wants the admin to
enter the stock, see what is left each day, and be warned before going over.

## Decision
- **Setting**: `venue.sunbed_stock` and `venue.deckchair_stock`, whole numbers 0..9999, or
  **empty = not tracked** (the default, so nothing changes until an admin sets them). Set in
  Beach settings, logged in the activity stream like the check-in time.
- **Use on a day**, for the whole venue (all spaces): sunbeds = the sum of `booking_spot.sunbeds`
  over the `booked` spot days of that date; deckchairs = the sum of `booking.deckchairs` over the
  bookings with a `booked` day that date. Released days and no-shows don't use stock.
- **Count**: when a stock is set, the map's day counts add "free / stock" for it. Free can go
  below 0, shown as over the stock.
- **Warn, don't block**: creating a booking or season pass, and moving a booking to new dates,
  is refused with `error: "stock"` and the days over (up to every day of the booking) when it
  would take a tracked stock past its number on any day. Sending it again with
  `allowOverStock: true` saves it. The check runs in the writing transaction, after the rows are
  written, so it sees exactly what the booking adds; a refusal rolls everything back.
- Only the stock the booking uses is checked: a booking with 0 deckchairs is never warned about
  deckchairs, even on a day already over.
- Not checked (counts still show it): moves that keep their dates (sunbeds go with the umbrella),
  restoring released days or no-shows, undo, and lowering the stock below today's use.

## Consequences
- Two desks booking at once can both pass the check and end over the stock. That is acceptable
  for a warning; the counts show it.
- Stock is per venue, not per space.
