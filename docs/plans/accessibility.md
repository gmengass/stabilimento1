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

## Gaps to audit and fix, in order
1. **Tooling**: add `vitest-axe`; render tile map, login form, acting dialog, booking panel in
   both locales under jsdom (`@testing-library/react` and `jsdom` already present). Record
   baseline findings here before fixing.
2. **Landmarks**: `<main>`, skip link, page `<title>`, heading order (`(app)/layout.tsx`, `layout.tsx`).
3. **Contrast**: tile state colours (`viewClass` in `beach-map.tsx`), `text-[10px]` captions and
   badges, green/red/blue status text, both themes. Token unit test computing ratios
   (jsdom cannot). Palette changes touch ADR 0017: ask owner first.
4. **Tile state not by colour alone**: confirm each state has a text or shape cue.
5. **Panel (phone bottom sheet)**: it is an `<aside>`, fixed on `max-md`; move focus in on open,
   Escape closes (exists, `beach-board.tsx:386`), return focus to the tile.
6. **Reduced motion**: add `prefers-reduced-motion` handling in `globals.css` (none today).
7. **Focus ring**: visible, 2px, both themes, never clipped by `overflow-x-auto` map wrapper.
8. **Forms**: visible labels and errors on login, quick book, booking, admin forms;
   focus first error on submit. Check password manager and paste allowed (WCAG 3.3.8).
10. **Targets**: tiles are `h-14` (56px) tall and `minmax(3.25rem)` wide: fine; check sheet
    controls, date jump, search, admin forms at phone width (24px min, 44px primary).
11. **Reflow/zoom**: 320px and 200%; Android WebView must not block zoom (ADR 0010, check
    `android/`).
12. **e2e axe** (`@axe-core/playwright`, tags wcag2a/aa/22aa) on main pages, both themes, tablet
    and phone. CI only; needs its own `ownSignInBucket` if it signs in.

## Status
Done: axe on beach board + login (it/en, light), contrast test, skip link, page titles.
Gap: axe on open booking panel, acting dialog, admin forms and dark theme; items 5, 6-9, 11, 12.

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
- Contrast fixes may alter the palette (ADR 0017): owner approves any visible colour change.
