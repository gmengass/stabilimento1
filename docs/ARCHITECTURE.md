# Architecture

> High-level map of the system. Update it when structure changes. Details belong in ADRs.

## Overview
One web app and one PostgreSQL database, shared by all users (ADR 0003). Single venue (one beach
club) with one or more booking areas. 5–10 staff users; changes appear on other staff screens
within seconds.

## Core domain (stack-independent)
- **Venue**: the beach club (exactly one for now; modeled as a table so it isn't hard-coded)
- **Area**: a bookable zone within the venue (e.g. main beach, second area), with its own layout
  and opening season. Adding an area is a data change, not a code change.
- **Spot** (the bookable resource): a sunbed, umbrella or other unit in an area, with type, row and
  position on the area map
- **User**: id, role (admin | staff | customer), contact details
- **AvailabilityRule**: recurring hours, plus exceptions (holidays, one-off blocks)
- **Booking**: resource, customer, start_utc, end_utc, status
  (pending | confirmed | cancelled | completed | no_show)
- **Payment** (optional): booking, amount, provider reference, status

## Invariants
- No two active bookings for the same resource may overlap. This is enforced in the database
  (e.g. a PostgreSQL exclusion constraint), not only in application code.
- All times are stored in UTC, along with the resource's IANA time zone.
- Status changes go through a single service function so they can be audited.

## Directory layout
_To be filled in after scaffolding._
