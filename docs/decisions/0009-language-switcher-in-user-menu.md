# 0009. Language switcher in the user menu after login

- Status: Accepted
- Date: 2026-11-13 (owner request)
- Amends: [ADR 0005](0005-interface-languages.md), the "Language switcher on every screen" bullet

## Context
- ADR 0005 put the switcher on every screen, always visible in the header.
- Staff change language rarely; the owner asked that it show only after tapping the logged-in
  user's name, to keep the top bar clear.

## Decision
- **Logged in**: the user's name in the top bar is a button. Tapping it opens a small panel that
  holds the language switcher. The panel closes on a tap outside, Escape, or tapping the name again.
- **Login page**: the switcher stays directly visible (nobody is logged in yet).
- Pages outside both (not-found) have no switcher; they use the language already chosen.
- Everything else in ADR 0005 is unchanged: where the choice is saved, immediate effect, no
  re-login, no lost form input.

## Alternatives considered
- **Keep it always visible** (ADR 0005): rejected by the owner.
- **A separate settings page**: more taps, and it would lose the "no lost form input" property.

## Consequences
- Changing language after login takes two taps instead of one.
- The user panel is the place for later per-user settings.
