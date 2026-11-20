# Plan: accessibility pass (Milestone 3)

Branch `feat/accessibility`. Scope (owner, 2026-11-20): keyboard use, contrast, target size, focus and zoom. Screen-reader support is out of scope; do not claim WCAG AA conformance.
Target: staff on tablets and phones, it + en, light + dark.
Sessions cannot run Playwright: component-level axe runs here, e2e axe runs in CI.

## Already in place (verified in source)
- `<html lang={locale}>` (`src/app/layout.tsx:27`); nav links and buttons `min-h-11`.
- Tiles: `<button aria-pressed>` in `<ol>` per line, sr-only name with state, badge and extras
  (`src/components/beach-map.tsx:84-118`).
- `role="status"` for save messages, `role="alert"` for login and acting errors.
- Acting pop-up is a native `<dialog aria-labelledby>` (`src/components/acting.tsx:185`).

## Work list and status
1. **Axe tooling**: `vitest-axe` on board, open/new booking panel, quick book, acting dialog,
   login (it + en). Done. Not covered: admin forms (jsdom cannot render the server pages).
2. **Landmarks**: `<main>` on every page, skip link, per-page titles. Done.
3. **Contrast**: token test of tile, status, notice and tab colours (`tests/unit/contrast.test.ts`);
   all pass, no palette change needed. Done.
4. **Tile state not by colour alone**: each state has a text or shape cue except season vs
   normal booking (colour only; both show a name). Open question for the owner.
5. **Phone sheet focus**: focus moves into the sheet on open, returns to the tile on Close and
   Escape. Done, tested (`tests/unit/panel-focus.test.ts`).
6. **Focus ring**: global 2px ring, light and dark, inset on tiles so the map's scroll area
   does not clip it. Done.
7. **Forms**: labels, `autocomplete` and `role="alert"` errors already present; paste allowed.
   No change needed.
8. **Tap targets**: padding gives every input and button more than 24px. Raised to 44px:
   login controls, tap-to-call phone links, admin "open map" link. Done.
9. **Zoom/reflow**: viewport does not block scaling; the Android wrapper sets no zoom limits.
   Real 200% / 320px check needs a browser (CI e2e or the owner).
10. **e2e axe** (`@axe-core/playwright`, tags wcag2a/aa/22aa) on main pages, both themes,
    tablet and phone. Not done: CI only; needs its own `ownSignInBucket` if it signs in.

Dropped: reduced motion (the app has no animations).

## Acceptance criteria
- Axe: zero violations on map, login, panel, acting dialog, admin pages (it + en, light + dark).
- Keyboard only: sign in, change date, open tile, book, cancel, undo.
- Acting dialog and panel: focus moves in, stays in, returns on close.
- Form error: first invalid field focused, error shown next to it.
- Reduced motion: no sheet or toast animation.
- Contrast ratios computed in a test: text >= 4.5, UI parts >= 3.

## Not testable in sessions
Android WebView zoom, e2e axe (CI only).

## Open questions
- Season tiles differ from normal bookings by colour only: add a text cue (a badge)? Owner decides.
- Contrast fixes may alter the palette (ADR 0017): owner approves any visible colour change.
