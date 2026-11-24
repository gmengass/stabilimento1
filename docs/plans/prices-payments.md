# Plan: Prices, first version (`feat/prices-payments`)

**Goal**: staff see a suggested price on each booking, computed from the season's price list the
admin entered, and can tick it "paid" (audited, undoable). The price list has its own full-screen
page. Owner decisions 2026-11-24; receipts stay on the club's till.

## New ADR
`docs/decisions/0029-prices-and-paid.md`: pricing model, formula, assumptions below, the paid flag,
and that prices are club data (never seeded). Amends ADR 0013 in one place: a paid/unpaid entry can
be undone after the booking's last day (season passes are paid at the end); undo still needs the
paid state to be as the entry left it.

## Pricing model
- Price depends only on the number of days (rows 1–31) and a season row (Stagionale). Every piece
  costs the same: umbrella, sunbed (incl. standalone sunbed spots), deckchair.
- Two columns per row: single piece and bundle (umbrella + 2 pieces, a small discount built in).
- Suggested total = floor(pieces / 3) × bundle[d] + (pieces mod 3) × single[d].
  Example: 1 umbrella + 3 sunbeds, 8 days = 230 + 77 = €307.
- Season passes are priced by their days like any booking (owner, 2026-11-24): days = first to
  last day minus released days. Stagionale is a cap: each column is min(col[d], col[Stagionale]),
  for every booking (only long ones reach it). Releasing a day lowers the suggestion.
- Assumptions: over 31 days = whole 31-day blocks at col[31] plus col[remainder], per column (so
  passes of 100+ days work too); the suggestion is computed, not stored,
  so moves and changes recompute it; a missing row (or no season) shows no suggestion, no error.
  A booking that crosses seasons uses its start date's season.

## Acceptance criteria
- An 8-day booking with 1 umbrella and 3 sunbeds shows €307,00 in the booking panel and the
  quick-book confirm, with its breakdown.
- If pieces or days change after the tick, it stays paid and the panel warns that the price
  changed since it was paid (current suggestion ≠ `paid_suggested_cents`).
- Ticking "paid" shows who and when (Rome time), writes a `paid` activity entry, and Undo clears it
  (ADR 0013 rules: author within 30 minutes, admin any time). Unticking writes `unpaid`.
- A communal tablet with no person chosen is refused with `needsActor` (ADR 0025).
- Every signed-in user has "Prezzi / Prices" in the user menu: a page without app nav filling the
  screen, rows 1–31 + Stagionale, single and bundle columns in EUR, it/en, readable on a 10" tablet.
- The admin edits a season's list under Seasons, with "copy from previous season"; staff can't.

## Data
- `price`: `season_id` (FK, cascade), `days smallint null` (null = Stagionale, check 1..31),
  `single_cents`, `bundle_cents` (int ≥ 0), `unique nulls not distinct (season_id, days)`,
  timestamps, `map_changed` trigger (ADR 0019).
- `booking`: `paid_at timestamptz null`, `paid_by text null` (FK user), both set or both null;
  `paid_suggested_cents int null`, the suggestion when ticked (owner chose a warning, 2026-11-24).
- Migration `0017_prices_paid.ts` with a down path (loses paid ticks: `/checkpoint` first).
- Money in integer cents; add `formatCents` (closes the `formatEur` open question).

## Files
ADR 0029, `docs/ARCHITECTURE.md`; migration 0017 + `src/db/types.ts`; `src/lib/pricing/suggest.ts`
and `price-list.ts`; `src/lib/booking/paid.ts`, `audit.ts`, `undo.ts`;
`src/app/(app)/booking-actions.ts` (`setPaidAction` via `actorFor()`); `src/app/(app)/admin/seasons/`
(price editor, `requireAdmin`); `src/app/prices/page.tsx` (outside `(app)`, `requireUser`);
user menu in `src/app/(app)/layout.tsx`; booking panel and quick book; `messages/*.json`.

## Risks and edge cases
- Pieces: count only current booking spots; don't count a standalone sunbed twice.
- Days = end − start + 1 (no-show days included). Concurrency: lock the booking row; a tick on an
  already-paid booking is a no-op with no audit entry. Cancelled bookings: tick refused.
- Security: tick is staff-level, rate-limited (`withinLimit("action")`), acting person on communal
  tablets; price save is admin-only with zod caps (0–1,000,000 cents). Security agent reviews.

## Tests
- Unit: days 1, 3, 31, 32, 62, 63, 120; pieces 0–6; €307 and the 16-day example; season passes
  (late start, released days, cap at Stagionale for 120 days); missing rows.
- Integration: tick/untick audit; undo rules incl. after the last day; parallel ticks give one
  entry; `needsActor`; staff refused on price save; migration up/down/up.
- e2e: prices page from the menu, it/en; paid tick + Undo; quick-book suggestion follows sunbeds.

## Steps (one commit each)
1. `docs:` ADR 0029 and ARCHITECTURE. 2. `feat:` migration 0017, types, rollback test.
3. `test:`/`feat:` pricing functions. 4. `feat:` price list load/save and admin editor.
5. `feat:` prices page and menu link. 6. `test:`/`feat:` setPaid, audit, undo.
7. `feat:` suggestion and tick in the panel and quick book. 8. `test:` e2e; full lint/type/test.

## Open questions
- A paid/unpaid badge on map tiles (needs palette OK, ADR 0017)? Left out by default.
- Payment PIN (ADR 0025): left out while paid is only a tick.
- Refunds on cancelled bookings; till integration (PROGRESS).
- Android: real fullscreen, or is a page without nav enough?
