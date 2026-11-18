# Plan: Check-in and the 11:00 hold rule (ADR 0004, ADR 0013, new ADR 0015)

**Goal**: staff check arrivals in per day; unclaimed day/multi-day bookings turn `no_show` at the
hold time (bookable, still flagged with the name), and a latecomer can be restored if the spot is free.

## Scope
- In: check-in / remove check-in (today), automatic no-show job, restore a no-show, booking-wide
  `hold_until` (late arrival), `venue.default_hold_until` (11:00), map states, activity, undo.
- Out: single-day hold override (ADR 0004 allows it; follow-up), admin UI for the default hold
  (seeded 11:00), live updates (later item), per-venue time zone (constant `Europe/Rome`).

## Data / migration `0009_check_in` (up/down)
- `check_in (booking_id → booking restrict, date, checked_in_at timestamptz default now(),
  checked_in_by → user restrict, primary key (booking_id, date))`: one per booking per day, covers
  all its umbrellas (ADR 0004 "CheckIn per booking per day").
- `venue.default_hold_until time not null default '11:00'`.
- `audit_log.user_id` nullable with `check (user_id is not null or action = 'no_show')`; action check
  adds `'check_in', 'uncheck', 'hold', 'no_show'`.
- Down: raises if any `check_in` row, new-action entry or `no_show` spot_day exists (restore the
  pre-update backup, as in 0008); otherwise drops the table/column and restores the checks.

## Hold rule semantics (`src/lib/booking/hold.ts`)
- Hold instant for day D = `(D + coalesce(booking.hold_until, venue.default_hold_until)) at time zone
  'Europe/Rome'`, computed in SQL (DST-safe); pure `holdInstant()` mirrors it for UI and tests.
- `applyHoldRule(db, now)`: for today only (`venueToday(now)`), `booked` spot_days of active,
  non-season bookings with `now >= hold instant`, `booking.created_at < hold instant` (a walk-in
  booked at 12:00 is never flagged), and no `check_in` for (booking, today) become `no_show`.
  Eligible bookings are locked `for update skip locked` (a check-in in flight wins; next run retries).
  Idempotent. Past days are never rewritten (box off all day → they stay `booked`).
- Brief and ADR 0004 agree: the spot is **freed** (bookable) and stays flagged, not just flagged.
- One `no_show` entry per run that flagged something: `user_id` null, `booking_id` null, `change`
  null (not undoable; restore is the path), detail `{date, bookings, umbrellas}`.
- Runner: minute timer started from `src/instrumentation.ts` `register()` (Node runtime only) plus
  one catch-up run at boot; `pg_try_advisory_xact_lock` so a second process skips. (ADR 0015)

## Server (`src/lib/booking/check-in.ts`), actions in `booking-actions.ts`, all staff
- `checkIn({bookingId, date})`: date must be today (`notToday`); active booking (`notFound`);
  booking has a `booked` day then (else `released` for a released pass day, `noShow` if flagged →
  UI offers restore); already checked in → `unchanged`. Season passes may check in (exempt from hold).
- `uncheck({bookingId, date})`: today only; deletes the row. After the hold instant the next job run
  flags it (stated in UI hint).
- `restoreNoShow({bookingId, date})`: today only; all of the booking's `no_show` rows that day →
  `booked` **and** check-in, all or nothing; any umbrella booked by someone else → `taken` + clashes;
  races decided by the unique index (23505/40P01 → `taken`). Logged as `restore`, detail `from: no_show`.
- `setHold({bookingId, holdUntil | null})`: non-season, end ≥ today, `HH:MM`; logged as `hold`.
  Doesn't revive an already `no_show` day (use restore).
- Authorization: `readCurrentUser` for all four; default hold is admin-only (seed/migration now).

## Audit / undo (`audit.ts`, `undo.ts`)
- `RecordedChange` gains optional `checkIns?: {date, before: boolean, after: boolean}[]` and
  `before/after.holdUntil?`. `apply()` also handles `moved` to `no_show` and inserts/deletes check-ins.
- `check_in` ↔ `uncheck` and `restore` (no_show) are undoable per ADR 0013; undo of a restore puts
  days back to `no_show` and removes the check-in. `listActivity` left-joins `user`; null → "System".

## Map UI (`beach-board.tsx`, `src/components/beach-map.tsx`, `bookings.ts` loaders)
- `loadOccupancy` adds `checkedIn`, `holdUntil`; new `loadNoShows` (like `loadReleased`).
- States: booked, checked in (distinct colour + tick), no-show (available colour, name, "no-show
  11:00"), rebooked no-show (new booking + marker opening the no-show), hold badge "hold 13:30".
- `BookingDetails`: Check in / Remove check-in (today), Restore (no-show, today), Late arrival time.

## i18n (it + en, parity test)
`booking.checkIn`, `uncheck`, `checkedIn`, `restoreNoShow`, `noShow` ("no-show {time}"), `holdLabel`,
`holdSet`, `holdClear`, `noShowMarker`, `uncheckHint`, `booking.errors.{notToday,noShow,released}`,
`activity.{check_in,uncheck,hold,no_show,system}`, `activity.undo` + `check_in`, `uncheck`.

## Acceptance criteria (`tests/integration/check-in.test.ts`, `hold.test.ts`, unit `hold.test.ts`)
1. Day booking for today, not checked in: `applyHoldRule` at 10:59:59 Rome changes nothing; at
   11:00:00 its days become `no_show`, one system entry; second run writes nothing.
2. `hold_until 13:30`: untouched at 12:00, flagged at 13:30. Checked-in, season pass, released day,
   cancelled booking, created after 11:00: never flagged. Yesterday/tomorrow rows untouched.
3. DST: hold instant correct on the last Sunday of March/October (unit, `holdInstant`).
4. Check-in: today only (`notToday` for past/future); cancelled → `notFound`; released pass day →
   `released`; flagged → `noShow`; twice → `unchanged`; multi-umbrella booking = one row.
5. Concurrency: check-in vs job at the boundary: either checked in and not flagged, or flagged and
   `noShow`, never both. Restore vs new booking on the same spot: exactly one wins.
6. No-show spot bookable by another booking; original restore then → `taken` with spot/day.
7. Restore sets `booked` + check-in; undo puts back `no_show`; undo of `check_in`/`uncheck` reverse.
8. Multi-day booking: check-in on day 1 doesn't cover day 2 (flagged day 2 at 11:00).
9. Activity shows "System" for no-show runs, not undoable. Migration up/down/up test.
10. E2E `e2e/check-in.spec.ts` (tablet + `phone`): check in from the map; no-show tile shows the name.

## Steps (one commit each)
1. `/checkpoint`; ADR 0015; migration 0009 + `db:types` + migration test.
2. `holdInstant` + unit tests (test first); `applyHoldRule` + integration 1–3.
3. `checkIn` / `uncheck` / `setHold` + tests 4, 8.
4. `restoreNoShow`, audit/undo extensions, activity "System" + tests 5–7, 9.
5. Runner in `instrumentation.ts` (check `node_modules/next/dist/docs/` first).
6. Loaders, map states, panel buttons, it/en messages; E2E; ARCHITECTURE.md (CheckIn, hold job).

## Open questions (owner); recommended default in brackets
- Box off at 11:00: flag on catch-up later today? [Yes, today only; past days stay `booked`.]
- Restore when only some of a family's umbrellas are free: partial? [No: all or nothing; quick-book.]
- Check in a forgotten arrival for yesterday? [No: today only.]
- Booking moved after 11:00 without check-in is flagged on the next run. OK? [Yes.]
- Single-day hold override and admin edit of the 11:00 default: next item? [Yes.]
