# 0030. Arturo and Sera themes, with larger "sun tiles" on the map

- Status: Accepted (owner, 2026-11-24)
- Date: 2026-11-24
- Details: `docs/plans/themes.md`. Amends [ADR 0017](0017-theme-switcher.md) in one place.

## Context
- Staff use the tablets on the beach in bright sun. Today's tiles use pale fills that wash out
  outdoors, and the booking name is 10px.
- The owner wants a look that matches the club (dark green umbrellas with an orange stripe,
  sand), a matching dark theme, and tiles that read at arm's length, still showing the name.
- ADR 0017 says map tiles keep the same colours in every theme.

## Decision
- The Theme select gets two more choices after Automatic, Light and Dark: **Arturo** (light) and
  **Sera** (dark). Same `theme` cookie, per device. Automatic, Light and Dark stay unchanged for
  now; they may be removed later.
- Both: the top bar is dark green `#1F3D2B` with light text and a 5px orange `#E8862A` stripe.
  Arturo's page is sand `#FBF6EC`; Sera's is night blue `#16232F` and Sera counts as dark, so
  every `dark:` colour applies. The theme names are styles, not branding: the club's name and
  logo still come from the box (`.env`).
- Both use **sun tiles** on the map: at least 64 × 72 px (a line of 18 fits a 1280px landscape
  tablet), a 3px outline, solid fills, number 18px, name 14px (cut with "…"), corner marks 12px.
  Free is white; booked red `#C1121F`; checked in green `#0B6E4F`; season pass violet `#5B21B6`;
  no-show yellow `#FFC300` with a dashed outline; a released season day is white with a dashed
  violet outline. Outlines are near-black in Arturo and light in Sera.
- Sun tiles carry a **status mark** in the top-right corner when no other badge is there: P (en
  B) booked, ✓ checked in, S season pass or released day, ? no-show. The map reads without
  colour.
- **Amends ADR 0017**: tiles keep one colour code across Light, Dark and Automatic, and one
  across Arturo and Sera. The two codes differ.

## Alternatives considered
- **Sun tiles in every theme**: changes what staff know today; the owner chose to keep Light and
  Dark as they are.
- **A separate "outdoor" switch on top of any theme**: two settings per tablet for one need.
- **72 × 72 px tiles**: easier to read, but a line of 18 scrolls sideways on a 1280px tablet.

## Consequences
- Two tablets in different themes show the same booking in different colours, until Light and
  Dark are removed.
- New tile colours need a `sun:` partner as well as a `dark:` one.
- On wide screens the booking panel's column shows only while a panel is open, so the map gets
  the full width otherwise (all themes).
