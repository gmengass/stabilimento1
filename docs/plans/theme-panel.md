# Plan: themed booking panel and buttons (branch feat/theme-panel)

Owner decision 2026-11-24. Extends ADR [0031](../decisions/0031-arturo-sera-themes.md) (palette OK
given, ADR 0017). No new ADR: nothing conflicts.

## Goal
In Arturo and Sera only, the booking panel gets a green header band, a white (Sera night-blue)
body, an orange main button, outlined secondary buttons and a dark-red cancel. Light, Dark and
Automatic look exactly as today.

## Acceptance criteria
- The panel's top is a band `#1F3D2B`, text `#FBF6EC`, 4px `#E8862A` stripe, with the panel title
  and Close (outlined in `#FBF6EC`). On a phone it is the sticky sheet bar (with Expand/Collapse).
  Covers new booking, booking details, move and quick book. The forms hide their own titles.
- Body: Arturo `#fff`, border `#d9cdb4`; Sera `#1E2F3D`, border `#34495a`. Price box and quick-book
  suggestion: Arturo `#FBF1E2` / `#5a3a10`; Sera `#2a2418` / `#F5C98B`.
- Primary (one per view): Quick book on the map, Book, Check in, Suggest, Move confirm: `#E8862A`,
  text `#2A1402`, 2px border `#2A1402` (Sera `#E8862A`).
- Secondary: every other outlined panel button: Arturo `#1F3D2B` text and 2px border; Sera text
  `#E8EEF2`, border `#8FA6B6`. Unchanged: the violet and amber restore buttons (status colours) and
  the move pick button (its blue pressed border).
- Cancel: trigger and confirmation box text/border `#8B1A1A` (Sera `#F5B5B5` / `#F08A8A`); "Yes,
  cancel" `#8B1A1A` (Sera `#B42318` with a `#F08A8A` edge), white text.
- Checkbox accent: `#1F3D2B` Arturo, `#E8862A` Sera. Orange focus ring on the band.
- axe: no WCAG 2.2 AA violations in Arturo or Sera (tablet, phone sheet, quick book).

## Design
- `src/components/button-classes.ts`: constants with only `sun:` classes, appended to each button's
  own classes, so Light can't change (unit test checks every class starts with `sun:`).
- The band is the `<aside>` header row in `beach-board.tsx`, shown at all widths in sun themes; it
  knows the title. Forms can't hold it: the suggestion and no-show boxes render above them.
- No `overflow-hidden` on the aside: it would become the band's sticky container and push it down.

## Risks
- Two looks for the same action on tablets in different themes (as with the tiles, ADR 0031).
- Long customer names in the band are cut with "…".
- The price box's own coloured lines (grey hint, green/amber paid) keep their colours; only plain
  text takes the brown. axe passes.
- Between md and lg (portrait tablets) the band sticks to the top of the screen while a long panel
  scrolls, keeping Close in reach.
- Out of scope: the "Ripristina" (undo) buttons in today's activity list.
