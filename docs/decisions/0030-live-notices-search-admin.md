# 0030. Live notices on search and admin pages

- Status: Proposed
- Date: 2026-11-24
- Amends: [ADR 0019](0019-live-map-updates.md) (its scope line: "the map page only")

## Context
Live updates reached the map only. Search results and the admin pages (Beach settings, Seasons, a
season's price list) stayed as loaded, so an admin could save over a change made on another device,
and a desk could act on a search result that was already cancelled or moved. Refreshing these pages
by themselves, as the map does, doesn't fit: every search counts against the search limits
(ADR 0027), and a refresh doesn't reset form fields, so an admin form would show stale values next
to fresh ones.

## Decision
- **Second signal**: statement-level `AFTER` triggers on `venue`, `area`, `area_line`, `spot`,
  `season` and `price` also call `pg_notify('setup_changed', '')` (migration 0018). Not `user`
  (a language switch writes it) nor `acting_staff` (every communal-tablet action writes it), so
  the staff page is not covered. `map_changed` is unchanged.
- **Stream**: the same `GET /api/live`, listening on both channels; `setup_changed` arrives as
  `event: setup`. Still no payload.
- **Notice, not refresh**: search follows `changed`, the admin pages follow `setup`. On a signal
  they show "… changed on another device" with a Reload button: a full page reload, so forms show
  the saved values and a new search is a deliberate one. A `resync` shows the notice too.
- **No catch-up on open**: these pages don't treat a (re)opened stream as a change, since streams
  reopen every 5 minutes. Changes made while a page was offline are not reported.
- **Own saves**: a signal within 10 s of the page itself submitting a form is taken as that save
  and shows nothing. A change from elsewhere in those 10 s is missed.
- **Prices page** (`/prices`, read-only): refreshes itself on `setup`, like the map.

## Consequences
- Bookings never disturb an admin page; setup edits are rare, so the notice is rare.
- Search pages keep one open stream each, counted in the 10 per user (ADR 0019).
