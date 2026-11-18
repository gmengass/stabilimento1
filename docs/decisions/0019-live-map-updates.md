# 0019. Live map updates

- Status: Accepted (owner, 2026-11-18)
- Date: 2026-11-18
- Builds on: [ADR 0002](0002-tech-stack.md) (SSE fed by `LISTEN/NOTIFY`) and
  [ADR 0003](0003-hosting.md) (one box, no extra services)

## Context
Staff on several tablets and phones book the same beach. A map only changed on reload, so two
people could pick the same umbrella or miss a check-in made at the desk.

## Decision
- **Signal**: statement-level `AFTER` triggers on `booking`, `booking_spot`, `spot_day`,
  `check_in`, `audit_log`, `spot`, `area_line`, `area`, `venue` and `season` call
  `pg_notify('map_changed', '')`. Postgres delivers it only on commit and folds identical
  notifications in one transaction, so a commit sends one signal and a rollback none. The 11:00
  hold job needs no app change.
- **No payload**: the activity stream and the day counts are venue-wide, so every change makes
  every map stale. The stream never carries names, phones or ids.
- **Server**: one dedicated `LISTEN` connection per process, outside the pool, reconnecting with
  backoff; after a reconnect it sends `resync` so clients catch up on anything missed.
- **Stream**: `GET /api/live`, Server-Sent Events, signed-in users only (401 otherwise). Lines
  are `event: changed`, `event: resync` or `: ping` (every 25 s). Each stream ends after 5
  minutes and the client reconnects, so a banned user is cut off within 5 minutes.
- **Client**: on a signal it calls `router.refresh()`, debounced (400 ms; `refresh()` can't be
  awaited, so the debounce is what limits it). It reconnects with jittered backoff and
  refreshes once on every open, the first included, to catch up. It restarts the
  stream on `online` and whenever the page becomes visible (a waking tablet may hold a dead
  socket), and if no stream has opened for 6 minutes (pings are comments, which `EventSource`
  can't see, but the server ends every stream after 5). Offline, or down for over 2 s, it shows
  "Not live, reconnecting".
- **Caddy**: `/api/live` skips `encode`; Caddy already flushes `text/event-stream` at once.
- Scope: the map page only. Search and admin pages are not live.

## Consequences
- Any write to those tables, including direct SQL, updates open maps; no app code has to
  remember to publish.
- Each change costs one page refresh per open map (about 7 queries); fine for a club's devices.
- A restart drops every stream at once; jittered backoff spreads the reconnects.
- Open: a cap on streams per user (no rate limits exist yet), and whether a map left open on
  "today" should move to the new day at midnight.
