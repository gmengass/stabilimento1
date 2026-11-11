# 0005. Interface languages: Italian and English

- Status: Accepted
- Date: 2026-11-11 (accepted 2026-11-11, with the switcher available at all times)

## Context
- The owner wants the interface in both Italian and English (answered 2026-11-11).
- Only staff use the app (ADR 0003). There is no public site, so there is no SEO need for
  per-language URLs.
- Staff may share a tablet, so the language should follow the logged-in user, not the device.
- ADR 0002 does not cover translations.

## Decision
- Library: **next-intl** (App Router support, server components, typed message keys, ICU plurals
  and date/number formatting).
- Languages: `it` (default) and `en`. Message files: `messages/it.json`, `messages/en.json`.
  Every key exists in both; a unit test fails if one file has a key the other lacks.
- **No locale in the URL.** The active locale comes from the user's saved preference (after Auth),
  falling back to a `locale` cookie, then to `it`.
- **Language switcher on every screen**, before and after login (login page and the app header).
  - Logged out: it sets the `locale` cookie.
  - Logged in: it saves the user's preference and updates the cookie. The change applies
    immediately on the current page, with no re-login and no lost form input.
  - The preference follows the user to any device they log in on.
- Dates and numbers are formatted with the active locale; booking days stay local `date`s
  (ADR 0004) and are only formatted at the edge. Currency is EUR.
- No hard-coded user-facing strings in components; ESLint or review enforces this.

## Alternatives considered
- **Locale-prefixed URLs (`/it/...`, `/en/...`)**: standard for public sites, unnecessary for a
  staff tool and adds routing complexity.
- **Italian only, translate later**: retrofitting strings is costly; doing it from the first screen
  is cheap.
- **i18next / react-i18next**: widely used but less integrated with React Server Components.

## Consequences
- New roadmap item "Interface languages (IT/EN)", before Auth so the login screen is bilingual.
- The `user` table (Auth item) gets a `locale` column.
- Adds one runtime dependency (next-intl).
