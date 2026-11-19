# 0023. Sunbed and deckchair marks on the map tiles

- Status: Accepted (owner, 2026-11-19)
- Date: 2026-11-19
- Adds to: [ADR 0020](0020-deckchairs.md) and [ADR 0021](0021-sunbed-deckchair-stock.md)

## Context
Staff set out the chairs from the map. The default is the umbrella's included sunbeds (2) and no
deckchair; only a booking that differs from it needs a mark.

## Decision
- A booked tile shows nothing for the default. Otherwise a mark in its top-left corner:
  `L` = lettino (sunbed), `S` = sdraio (deckchair).
  - Sunbeds against the umbrella's `includedSunbeds`: `+L` for one more, `-L` for one fewer,
    `+2L` / `-2L` for bigger differences.
  - Deckchairs: `+S`, or `+2S`. Both are joined: `-L +S`.
- Sunbeds are stored per umbrella, so their mark is exact on every tile. Deckchairs belong to
  the booking (ADR 0020), so `+S` shows on the booking's lowest-numbered umbrella only.
- Screen readers get the words ("1 sunbed fewer, 1 deckchair"), in both languages.

## Consequences
- No data change. Placing deckchairs per umbrella would need a new column; not planned.
