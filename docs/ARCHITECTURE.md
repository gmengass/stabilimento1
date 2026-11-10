# Architecture

> High-level map of the system. Update it when structure changes. Details belong in ADRs.

## Overview
_To be written once the stack is accepted (ADR 0002)._

## Core domain (stack-independent)
- **User**: id, role (customer | provider | admin), contact details
- **Resource**: what can be booked (person, room, item, class), owned by a provider
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
