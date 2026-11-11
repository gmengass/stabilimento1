# 0006. Render every route per request (no static shell)

- Status: Accepted (on merge of this PR)
- Date: 2026-11-11

## Context
- `next.config.ts` enables Cache Components, which prerenders a static shell by default.
- ADR 0005 puts the locale in a cookie (later the user's preference), and `<html lang>` lives in
  the root layout. Reading `cookies()` outside `<Suspense>` fails the build.
- Only staff use the app, on a LAN (ADR 0003). After Auth, every screen is per-user anyway.

## Decision
- The root layout sets `export const instant = false` (Next 16 "allow blocking route"), so every
  route renders on the server per request. Cache Components stays on for `use cache` data caching.

## Alternatives considered
- **Suspense around locale-dependent UI**: `<html lang>` and the provider wrap the whole tree,
  so the boundary would cover everything and still not set `lang` in the shell.
- **`use cache: private`** for the locale: adds complexity for no gain on a LAN staff tool.

## Consequences
- No static shell or instant prefetching for any route; acceptable latency on a LAN.
- Revisit if a public or static page is ever added (it would need its own root layout).
