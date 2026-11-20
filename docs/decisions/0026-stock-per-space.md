# 0026. Stock per beach space

- Status: Accepted (owner, 2026-11-20: "enter stock for each beach space")
- Date: 2026-11-20
- Supersedes: the "per venue" parts of [ADR 0021](0021-sunbed-deckchair-stock.md): the setting,
  the "whole venue" use rule and the "Stock is per venue" consequence. The rest of 0021 stands.

## Context
The club has several beach spaces, each with its own sunbeds and deckchairs. One number for the
whole beach could not be entered per space.

## Decision
- `area.sunbed_stock` and `area.deckchair_stock` (0..9999, empty = not tracked) replace the
  `venue` columns. An admin sets them in Beach settings, in each space's panel.
- Use on a day is counted per space, with the 0021 rules. A booking never spans spaces
  ([ADR 0004](0004-booking-model.md)), so its deckchairs belong to one space.
- A space with no stock is not tracked: never warned, no free / stock shown, whatever the others.
- The map's counts and the warning use the stock of the space shown or booked in.
- Migration: an existing venue stock goes to the first space, so no number is lost; `down` puts the
  sum of the space stocks back on the venue.

## Consequences
- After migrating, an admin sets the other spaces' stock; until then they are not tracked.
- No venue-wide total is shown.
