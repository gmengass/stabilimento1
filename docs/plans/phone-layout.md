# Plan: Phone layout (bottom sheet, tap targets, phone e2e)

**Goal**: on phones (< 768px) the booking panel is a bottom sheet over the map, so staff can keep
tapping umbrellas while booking; all tap targets are ≥ 44px; e2e covers booking and quick book at
phone width.

## Acceptance criteria
- At 390×844, tapping a free umbrella opens the panel as a sheet fixed to the bottom (≤ 60dvh,
  scrolls inside). The map stays visible above and umbrellas can still be toggled.
- A booked umbrella, or the quick book button, opens the same sheet (details / quick book form).
- Sheet header: Collapse/Expand (folds to its header bar) and Close (same as the panel's close or
  clearing the selection). Escape inside the sheet closes it and focuses the quick book button.
- Opening the sheet on a phone scrolls the map to the top of the screen. The page scrolls far enough that the map's last line and the activity list
  clear the sheet.
- At ≥ 768px the layout is unchanged (side panel sticky at `lg`, stacked at 768).
- Every control on the map page is ≥ 44×44 CSS px at 390 width (measured by e2e).
- When the keyboard opens for a field in the sheet, the field stays visible.

## Design
- Breakpoint `max-md:` (Tailwind v4, no config). The existing `<aside>` becomes the sheet:
  `fixed inset-x-0 bottom-0 z-20 max-h-[60dvh] overflow-y-auto rounded-t-xl`, safe-area padding.
- Not a modal: no focus trap, focus isn't moved on open (the map stays usable). A named
  `<aside>` (a landmark). No new dependency.
- Collapsed state lives in BeachBoard; it expands again when the panel content changes (new
  booking opened, quick book, suggestion), not when umbrellas are toggled.
- Sheet header is `md:hidden`. i18n keys `sheet.collapse`, `sheet.expand`; reuse `booking.close`. Escape closes the panel on phones only.
- Scroll spacer on the page while a panel is open (`max-md:pb-[60dvh]`, header height collapsed).
- Tap targets: `min-h-11` on fields, small buttons, Undo, nav links, checkbox labels, `<summary>`.
  Umbrellas are already 56px tall and ≥ 52px wide. The app nav wraps at 390.
- Viewport `interactiveWidget: "resizes-content"` so the keyboard shrinks the layout.

## Tests
- Playwright project `phone` (390×844, touch, chromium), depends on `setup`, runs `phone.spec.ts`.
- `phone.spec.ts`: sheet opens at the bottom; a second umbrella can be added and the booking goes
  through; quick book suggest + confirm in the sheet; collapse/expand/Escape and focus; 44px check
  over visible buttons, links and inputs. Unique year 2092; no translated-text selectors.
- No unit tests: the change is presentational.

## Risks
- Android 7 WebView may ignore `interactiveWidget`: check on the oldest tablet.
- The sheet covers the activity list (and Undo) until staff scroll or collapse it.

## ADR
Not needed (UI only, no ADR contradicted). The 44px rule goes in ARCHITECTURE.md as a convention.
