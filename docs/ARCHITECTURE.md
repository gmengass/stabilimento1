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
- **Spot** (the bookable resource): a sunbed, umbrella or other unit in an area, with type, row and
  position on the area map
- **User**: a staff login. id, name, role (admin | staff)
- **Customer**: name, phone, optional email and notes (no login)
- **SpotClosure**: spot, date range, reason (maintenance, reserved by the club)
- **Season**: area, name, start_date, end_date
- **Booking**: spot, customer, start_date, end_date (inclusive local dates), kind
  (day | multi_day | season), season (if kind = season), status (confirmed | cancelled) (ADR 0004)
- **CheckIn**: booking, date, checked-in time, staff user
- **AuditLog**: user, action, booking, before/after, timestamp
- **Payment** (later): booking, amount, method (cash/card at desk), staff user

## Invariants
- No two active bookings for the same spot may overlap in dates. This is enforced in the database
  (PostgreSQL exclusion constraint on a daterange), not only in application code.
- Booking days are local calendar dates (`Europe/Rome`); timestamps are stored in UTC (ADR 0004).
- Status changes go through a single service function so they can be audited.

## Directory layout
_To be filled in after scaffolding._
