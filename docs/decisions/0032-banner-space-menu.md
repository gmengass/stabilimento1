# 0032. Beach space picked from the banner, remembered per device

- Status: Accepted (owner, 2026-11-26)
- Date: 2026-11-26

## Context
- The map had a row of pill tabs, one per beach space, above the date bar. It took a row on
  phones and small tablets, and the space's name only showed as the filled pill.
- The club has two spaces; staff switch between them, but not often.
- A bare `/` (sign-in, the Android app, the banner link from other pages) always opened the first
  space.

## Decision
- With two or more spaces the banner's map link shows the space's name (bold, cut short on
  phones) and a separate ▾ button (44 px) opens a list of the spaces, as a disclosure of links
  (`aria-expanded`/`aria-controls`, Escape closes). Picking one keeps the day being viewed. With one
  space the banner keeps the plain "Mappa spiaggia" link. Admin › Impostazioni spiaggia keeps its
  own tabs.
- The sea band shows the space name large and bold, pinned to the visible width of the map.
- The space last viewed on the map is kept in an `area` cookie: **per device**, like the theme
  ([ADR 0017](0017-theme-switcher.md)), one year, `SameSite=Lax`, `Secure` over https. It holds
  only a space id, so it is written by the browser and is not httpOnly: a Server Action would
  re-render the map a second time on every switch.
- One rule picks the space, on the server and in the menu (`pickArea`): the URL's `area`, else
  the cookie, else the first space; ids that match no space are skipped. A stale URL redirects to
  the space picked. Links with `area` (search results, [ADR 0016](0016-day-counts-and-search.md))
  still win, and so become the remembered space.

## Alternatives considered
- **Keep the tabs**: one tap to switch, but a row of screen and a weak "which space?" cue.
- **Server Action for the cookie** (as for theme and language): httpOnly, but an extra request and
  re-render on each switch, for a value that is not a secret.
- **Remember per user**: wrong for shared tablets, as for the theme.
