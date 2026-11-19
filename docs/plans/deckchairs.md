# Plan: deckchairs (sdraio / sdraie)

Branch `feat/deckchairs`. Owner request (2026-11-19): every booking keeps its sunbeds (2 per
umbrella by default) and can add a deckchair when required.

## Today
Sunbeds are per umbrella per booking (`booking_spot.sunbeds`, migration 0004). The "2" is the
umbrella's `spot.included_sunbeds` (default 2, `max_sunbeds` default 3, ADR 0004). No deckchairs.

## Model
- `booking.deckchairs smallint not null default 0`, check `between 0 and 40` (backstop).
- Cap: `deckchairs <= MAX_DECKCHAIRS_PER_UMBRELLA (2) × umbrellas` (`src/lib/beach/limits.ts`).
- No venue stock, no free/total counts; deckchairs don't count toward `max_sunbeds`.
- Per booking, so move and undo carry it over without code changes.
- ADR 0020 records this; it adds to ADR 0004 without contradicting it.

## Changes
1. `docs:` ADR 0020 + this plan.
2. `feat:` migration `0011_booking_deckchairs.ts` (up + down), `npm run db:types`.
3. `test:` failing tests: default 0, bounds, invalid input, season pass, move, undo.
4. `feat:` `bookings.ts` schema + write + read, `passes.ts`, audit detail on `book`.
5. `feat:` booking form select (0..2×umbrellas, default 0), details line when > 0, quick book
   field handed to the form, activity text, `messages/it.json` + `en.json`.
6. `test:` e2e: create with a deckchair, see it in the details.

## Acceptance criteria
- No `deckchairs` in a create request → stored 0; sunbeds unchanged.
- 1 umbrella + 2 deckchairs → saved and shown ("2 sdraie" / "2 deckchairs").
- 3 on 1 umbrella, -1, 1.5, "1", null, 41 → `invalid`, nothing written.
- Season pass with 1 deckchair → stored.
- Moved booking (umbrellas, dates, swap) keeps its count; undo of the move keeps it.
- Undo of a booking cancels it; restoring it keeps the count.
- Migration up → down → up runs; existing bookings read 0.

## Open questions (defaults assumed)
1. Per booking, max 2 per umbrella.
2. No limited deckchair stock to count.
3. Adding deckchairs to an existing booking: a follow-up item.
