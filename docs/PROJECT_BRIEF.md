# Project brief

> The single source of truth for *what* we're building. Claude reads it when planning.
> Items marked _(to confirm)_ are drafts, so correct them in a PR.

## One-line pitch
An on-site booking system for a beach club (stabilimento balneare) that lets staff book, move and
cancel sunbeds, umbrellas and other spots from a live map of the beach.

## Who uses it
| Role | Who | What they need |
|------|-----|----------------|
| Staff | 5–10 people, several at once, on phones/tablets over the staff Wi-Fi | See the beach map with what's free or taken, book a spot for a customer, move/cancel bookings, check customers in |
| Admin (owner) | 1–2 people | Everything staff can do, plus manage areas, spots, prices, seasons and staff accounts; view reports |

Customers do **not** use the app. Staff enter all bookings (walk-in, phone, regulars).

## What gets booked
- **Umbrellas** (ombrelloni), standard **2 sunbeds** (lettini) each, **max 3**, laid out in
  **lines** (file). **Line 1 is closest to the shore.** Lines are grouped into **areas**.
- Standalone sunbeds (no umbrella) are supported but not used at launch.
- One club with one area at launch. Further areas can be added later without code changes.
- Booking units: **full day**, **several consecutive days**, and **season pass** (whole season).
  No half days or hourly slots (ADR 0004).

## Must-have for v1 (MVP) _(to confirm)_
- [ ] Staff and admin login
- [ ] Areas and spots set up by the admin, laid out on a visual map
- [ ] Live map per day: free / booked / checked in, updated across devices within seconds
- [ ] **Quick book**: name, phone, number of umbrellas and sunbeds; the system suggests spots,
      staff confirm in one tap (ADR 0004)
- [ ] **Date view**: pick any date and see umbrellas and sunbeds free vs total, plus a map by line
- [ ] Create, move and cancel a booking with no double bookings: one day, several days, or a
      season pass
- [ ] **Release days** of a season pass so the spot can be sold for those days; the pass shows its
      first day and number of released days
- [ ] **11:00 hold rule**: day/multi-day reservations not checked in by 11:00 free up
      automatically (season passes exempt); per-booking later hold time for late arrivals;
      no-show spots stay flagged on the map with the customer's name
- [ ] Check-in of arrivals
- [ ] Seasons set up by the admin (start and end dates)
- [ ] Search bookings by customer name or phone
- [ ] Nightly encrypted backups to OneDrive (ADR 0003)

## Later / nice-to-have
- Prices, payments recorded at the desk, daily cash-up report
- Regular-customer history (who had which spot last season)
- Remote access via Tailscale (ADR 0003)
- Additional booking areas
- Italian / English interface

## Out of scope
- Public website or online booking by customers
- Online card payments
- Customer accounts

## Constraints
- Open source (MIT). Self-hosted on a local server at the club (ADR 0003).
- Hosting budget: one-off hardware, no monthly hosting fees.
- Must keep working without internet.
- Personal data (names, phone numbers) handled under GDPR.
- Languages / currency: _(to confirm)_ Italian and/or English; EUR.
