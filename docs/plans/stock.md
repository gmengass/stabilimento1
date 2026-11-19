# Plan: sunbed and deckchair stock (lettini / sdraie)

Branch `feat/stock`, on top of `feat/deckchairs` (#61). Owner request (2026-11-19): stock for
lettini and sdraie in the admin panel; count and warn (ADR 0021).

## Changes
1. `docs:` ADR 0021 + this plan.
2. `feat:` migration `0012_venue_stock.ts`: `venue.sunbed_stock`, `venue.deckchair_stock`,
   `integer null check (between 0 and 9999)`; down drops them. `npm run db:types`.
3. `feat:` `src/lib/booking/stock.ts`: `loadStockDay(db, date)` (free/total or null per item) and
   `overStock(tx, from, to, uses)` (days over, by how many).
4. `feat:` `bookings.ts` / `passes.ts` / `move.ts`: `allowOverStock` (boolean, default false);
   check inside the transaction after writing; `{ ok: false, error: "stock", days }`.
5. `feat:` admin: `setStock` in `edit.ts`, `setStockAction` (logged `setStock` from/to),
   `StockForm` in Beach settings (two number inputs, empty = not tracked).
6. `feat:` UI: day counts show stock lines; booking form and move form show the warning and
   "Book anyway" / "Move anyway"; it/en messages; activity text for `setStock`.
7. `test:` integration + unit + e2e.

## Acceptance criteria
- No stock set → booking, pass, move behave as before; day counts unchanged.
- Admin sets 20 lettini / 4 sdraie → saved, logged; blank clears; -1, 1.5, 10000, "x" → invalid.
- Day counts: "Lettini in magazzino: 18 / 20" after a 1-umbrella, 2-sunbed booking; deckchairs
  likewise; venue-wide across spaces; released / no-show days don't count; over shows negative.
- Booking that takes sunbeds past the stock on any day → `stock` with those days, nothing
  written; same with `allowOverStock: true` → saved.
- Exactly at the stock → saved without a warning (boundary).
- Booking with 0 deckchairs on a day over the deckchair stock → no warning.
- Season pass over the stock → warned; move to new dates over the stock → warned, nothing moved;
  spot-only move → never warned.
- Non-admin `setStockAction` → forbidden.
- Migration up → down → up runs; existing venues read null.
