# Plan: Arturo and Sera themes, sun tiles (branch feat/themes)

Owner decisions 2026-11-24. ADR [0030](../decisions/0030-arturo-sera-themes.md).

## Goal
Two per-device themes, Arturo (light) and Sera (dark), with the Arturo banner and larger "sun
tiles" on the beach map. Automatic, Light and Dark stay as they are (maybe removed later).

## Acceptance criteria
- The Theme select lists Automatic, Light, Dark, Arturo, Sera (it/en). A choice sets
  `<html data-theme>` at once and survives a reload (cookie, ADR 0017).
- Arturo: page #FBF6EC; top bar #1F3D2B, text #FBF6EC, 5px #E8862A bottom stripe.
- Sera: page #16232F, `color-scheme: dark`, every `dark:` class applies, the same banner. Sea band
  #0C3B5E, text #BFE3F7.
- In Arturo and Sera each tile is at least 64 × 72 px, 3px border, 8px radius; number 18px/500,
  name 14px with an ellipsis, corner marks 12px/500. Fills and borders as in ADR 0030.
- Top-right corner: the badge wins; otherwise booked P (en B), checked in ✓, season S, no-show ?,
  released S in violet. Free, selected and open show none. Screen-reader labels unchanged.
- Light, Dark and Automatic tiles look as today.
- On wide screens the panel column shows only while a panel is open (all themes). At 1280 × 800
  with no panel open, a line of 18 umbrellas fits without sideways scrolling.
- axe (WCAG 2.2 AA) reports no violations in Arturo and in Sera.

## Steps (one commit each)
1. `docs:` this plan, ADR 0030, ADR 0017 marked amended.
2. `feat:` themes in config and messages; CSS `dark` variant includes `sera`, new `sun` variant,
   per-theme variables. Unit tests.
3. `feat:` banner, user-menu text colour, Sera sea band. e2e: colours and persistence.
4. `feat:` sun tiles: size, fills, marks (`statusMark`). Unit tests.
5. `fix:` panel column only while a panel is open. e2e: 18 tiles fit at 1280 × 800.
6. `test:` a11y spec also runs in Arturo and Sera.

## Decided while planning
- With a panel open on a 1280px tablet, the map scrolls sideways, as now.
- Sera "selected" uses the light #E8EEF2 outline; "open" shows no state mark.
- Sera "released" mark text is #5B21B6 (#A78BFA only for the border: 2.3:1 as text).
- The user-menu panel inside the banner gets `text-foreground`.

## Risks
- The same booking state has two colour codes on different devices (Light vs Arturo).
- axe only checks tiles on screen; palette contrast checked by hand.
- Corner crowding at 64px ("+2L" with "13:30"): check with real names.
- The admin layout editor uses BeachMap and gets sun tiles too.
- Out of scope: button colours, Android rebuild (the WebView reads the cookie).
