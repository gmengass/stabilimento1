# 0017. Light and dark theme, chosen per device

- Status: Accepted
- Date: 2026-11-18 (owner request)

## Context
- The page followed the device's light/dark setting through `prefers-color-scheme`, but only for
  the page background and text: screens with fixed colours were hard to read in dark mode.
- The Android app ([ADR 0010](0010-android-app.md)) uses a light theme, and its WebView reports
  "light" whatever the tablet is set to, so desktops showed dark and tablets light.
- The owner asked for a light/dark toggle next to the user's name.

## Decision
- The user panel ([ADR 0009](0009-language-switcher-in-user-menu.md)) gets a **Theme** select
  under the language: **Automatic** (default, follows the device), **Light**, **Dark**.
- The choice is saved in a `theme` cookie (httpOnly, one year), **per device, not per user**:
  tablets are shared, and the light at the desk decides, not who is logged in.
- The root layout renders `<html data-theme>` from the cookie, so the first paint is already in
  the right theme. Tailwind's `dark:` variant follows that attribute, or the device when it is
  "system". Every screen has dark colours.
- Booking tiles on the map keep the same colours in both themes, so the colour code stays the same.
- The login page has no switcher; it uses the device's cookie like every other page.

## Alternatives considered
- **Per user, in the database** (like the language): wrong for shared tablets.
- **Only force light**: simpler, but the owner wants dark available.
- **Follow the tablet's setting in the Android app** (DayNight theme): needs an app rebuild and
  still no override; possible later, and "Automatic" would then pick it up.

## Consequences
- A new colour class in a component needs a `dark:` partner (or a theme variable).
- On a tablet, "Automatic" means light until the Android app follows the system theme.
