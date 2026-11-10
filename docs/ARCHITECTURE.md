# Architecture

> High-level map of the system. Update it when structure changes. Details belong in ADRs.

## Overview
One web app and one PostgreSQL database on a local server at the club, reachable only from the
staff Wi-Fi (and optionally Tailscale), with nightly encrypted backups to OneDrive (ADR 0003).
Single venue with one or more booking areas. 5–10 staff users; changes appear on other staff
screens within seconds. Customers never use the app. They are contact details on a booking.

## Core domain (stack-independent)
- **Venue**: the beach club (exactly one for now; modeled as a table so it isn't hard-coded)
- **Area**: a bookable zone within the venue (e.g. main beach, second area), with its own layout
  and opening season. Adding an area is a data change, not a code change.
- **Row**: area, label, order on the map
- **Spot**: row, position, kind (umbrella | sunbed), included_sunbeds, max_sunbeds
- **User**: a staff login. id, name, role (admin | staff)
- **Customer**: name, phone, optional email and notes (no login)
- **SpotClosure**: spot, date range, reason (maintenance, reserved by the club)
- **Season**: area, name, start_date, end_date
- **Booking**: customer, kind (day | multi_day | season), start_date, end_date (inclusive local
  dates), season, status, notes
- **BookingSpot**: booking, spot, sunbeds (how many go with this umbrella)
- **SpotDay**: spot, date, booking_spot, state (booked | released). Unique per (spot, date)
  while occupied (ADR 0004)
- **CheckIn**: booking, date, checked-in time, staff user
- **AuditLog**: user, action, booking, before/after, timestamp
- **Payment** (later): booking, amount, method (cash/card at desk), staff user

## Invariants
- A spot can be occupied by at most one booking per day. This is enforced in the database
  (unique (spot, date) on SpotDay), not only in application code.
- Booking days are local calendar dates (`Europe/Rome`); timestamps are stored in UTC (ADR 0004).
- Status changes go through a single service function so they can be audited.

## Directory layout
_To be filled in after scaffolding._
