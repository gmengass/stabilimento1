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
   normal booking (colour only; both show a name). Deferred by the owner, see Open questions.
5. **Phone sheet focus**: focus moves into the sheet on open, returns to the tile on Close and
   Escape. Done, tested (`tests/unit/panel-focus.test.ts`).
6. **Focus ring**: global 2px blue ring (light and dark, tested at 3:1); tiles get an inset
   black line with a white band so it shows on every tile colour and is not clipped. Done.
7. **Forms**: labels, `autocomplete` and `role="alert"` errors already present; paste allowed.
   No change needed.
8. **Tap targets**: padding gives every input and button more than 24px. Raised to 44px:
   login controls, tap-to-call phone links, admin "open map" link. Done.
9. **Zoom/reflow**: viewport does not block scaling; the Android wrapper sets no zoom limits.
   `e2e/a11y.spec.ts` checks no sideways page scroll at 320px on every page. Passes in CI (fixed
   Seasons date row and Staff table).
10. **e2e axe** (`e2e/a11y.spec.ts`, `@axe-core/playwright`, wcag2a/aa/21/22aa): map, search,
    admin pages, open panel, login; light + dark; tablet + phone. Uses the saved admin session, so
    no sign-in bucket. Passes in CI: axe found no violations (contrast and target size included).

Dropped: reduced motion (the app has no animations).

## Acceptance criteria
- Axe: zero violations on map, login, panel, acting dialog (it + en; jsdom). Admin pages and
  light/dark runs: CI e2e axe only.
- Keyboard only: sign in, change date, open tile, book, cancel, undo.
- Phone sheet: focus moves in for a booking or quick book, returns to the tile (or Quick book) on close. Acting dialog is a native modal `<dialog>`.
- Form errors are labelled and announced next to the form (existing `role="alert"`).
- Contrast ratios computed in a test: text >= 4.5, UI parts >= 3.

## Not testable in sessions
Android WebView zoom, e2e axe (CI only).

## Open questions
- Season tiles differ from normal bookings by colour only. A text cue (a badge) is deferred by the
  owner (2026-11-20) to a future item; not part of this pass.
- Contrast fixes may alter the palette (ADR 0017): owner approves any visible colour change.
