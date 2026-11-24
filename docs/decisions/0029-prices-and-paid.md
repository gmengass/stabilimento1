# 0029. Prices: a suggested price per booking, and a "paid" tick

- Status: Accepted (owner, 2026-11-24)
- Date: 2026-11-24
- Details: `docs/plans/prices-payments.md`. Amends [ADR 0013](0013-activity-and-undo.md) in one place.

## Context
The club prices by its own printed list (2027 prices, carried over from 2026). A price depends only
on how many days a customer stays and how many pieces they take; it does not change by month or by
line. Staff want the app to work out the price and to show who has paid. Receipts are issued on the
club's registered till, and stay there for now (till integration is an open question in PROGRESS).
Cabins are on the list but are not modelled yet.

## Decision
- **Price list**: per season, entered by the admin under Seasons (with "copy from previous
  season"). Rows for 1 to 31 days and one season row (Stagionale). Each row has two columns: the
  price of **one piece** and of a **bundle** (umbrella + 2 pieces, a small discount built in).
  Prices are club data: they are never seeded or committed. Money is stored in integer cents.
- **Pieces**: every umbrella, sunbed and deckchair on the booking counts as one piece, whatever it
  is. A standalone sunbed spot is one piece.
- **Days**: from the first to the last day, minus released days. No-show days count.
- **Suggested total**: for `d` days, `floor(pieces / 3) × bundle[d] + (pieces mod 3) × single[d]`,
  where each column's price for `d` is:
  - over 31 days, whole 31-day blocks at the 31-day price plus the price of the remaining days;
  - never more than that column's Stagionale price (the cap applies to every booking; in practice
    only long season passes reach it).
  A season pass is priced the same way; it does not get the Stagionale price by itself.
- The suggestion is **computed, not stored**: a move, new pieces, a later last day or a released
  day change it. It uses the season that contains the booking's first day. When a row it needs is
  missing, or no season covers the first day, no price is shown (not an error).
- **Discount**: shown under the suggestion against the one-day price,
  `pieces × days × single[1] − suggestion`, as euros and a whole percentage rounded down; shown only
  when above zero.
- **Paid**: a tick on the booking. It records who ticked it, when, and the suggestion at that
  moment. If the suggestion later differs, the booking stays paid and the panel warns that the
  price changed since it was paid. Ticking writes a `paid` entry and unticking an `unpaid` entry in
  the activity stream; both can be undone. Any staff member may tick, like booking; on communal
  tablets the person chosen is recorded (ADR 0025). Cancelled bookings cannot be ticked.
- **Prices page**: "Prezzi" in the top bar for everyone signed in: a full-screen table drawn from
  the stored prices, not a photo of the list, so it always matches what the app suggests.

### Amendment to ADR 0013
A `paid` or `unpaid` entry can be undone after the booking's last day (season passes are paid at
the end). The other undo rules stay: today's entries only, the author within 30 minutes or an admin,
and only while the paid state is as the entry left it.

## Alternatives considered
- **A rate table by month and line**: what many clubs use, but not how this club prices.
- **Storing the price on the booking**: a changed price list would not reach booked customers, and
  every change to a booking would need to rewrite it. The paid snapshot covers the one case where
  the old price matters.
- **Payment entries with amounts and a daily cash-up**: deferred by the owner; the tick is the
  first version.
- **Showing a photo of the printed list**: it could disagree with the stored prices, and an upload
  would bring a club image into the app.

## Consequences
- Migration 0017: a `price` table and `paid_at`, `paid_by`, `paid_suggested_cents` on `booking`,
  with a down path that drops them (paid ticks are lost: take a checkpoint first).
- The audit log gains `paid` and `unpaid` actions.
- Each season needs its price list entered before suggestions appear.
- A PIN for payments (ADR 0025) is not needed while "paid" is only a tick.
