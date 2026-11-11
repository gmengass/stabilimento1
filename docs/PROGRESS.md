# Progress

> Rewritten (not appended) at the end of every session with `/wrap-up`. Keep under 40 lines.
> Git history keeps the old versions.

## Current state
Branch `feat/i18n` (PR open) adds IT/EN per ADR 0005 with next-intl 4.14.10: `src/i18n/`
(config, `resolveLocale`, `setLocale` action, formatters), `messages/{it,en}.json`, header
`LanguageSwitcher`. Root document streams inside `<Suspense>` (cacheComponents + cookie).
User preference is a seam (`getUserLocalePreference`/`saveUserLocalePreference`) for Auth.
162 tests pass locally; lint, typecheck, build green. Reviewer and security findings fixed.

## Done this session
- Plan `docs/plans/i18n.md`; tests first (locale, action, format incl. DST/TZ, parity, lint, request)
- Switch applies in place via server action + `refresh()`; input kept (checked in headless Chrome)
- Lint: `react/jsx-no-literals` + restricted attribute literals in `src/app`, `src/components`
- Translated `not-found.tsx` (real 404), bilingual `global-error.tsx`
- Docs: ARCHITECTURE layout, CLAUDE.md standard, brief no longer lists IT/EN as "Later"

## Next up
1. Merge the `feat/i18n` PR once CI is green
2. "Auth (sign up, log in, roles)" on `feat/auth`: add `user.locale` with CHECK, implement the seams
3. Then "Deploy" (needs Mini PC details) or the Milestone 1 rewrite docs PR

## Open questions
- Auth: `saveUserLocalePreference` must take the user from the session, never the client (IDOR);
  check `redirect()` status codes inside the root Suspense (307 vs streamed meta redirect)
- Playwright e2e (e.g. "no lost input") in the repo? Manual check only so far
- Roadmap Milestone 1 (providers, working hours, customer search, email) contradicts the brief
  and ADR 0004: rewrite it in a docs PR
- Alphanumeric umbrella labels ("A12")? Only integers for now
- Retiring a spot that has bookings: soft-delete or never delete? Decide in the admin CRUD item
- VenueSettings (time zone, hold-until): `VENUE_TIME_ZONE` is a constant until then
- Ruleset `rulset1` requires `docker` only: add `checks` too
- OneDrive backup permission: shelved until the Backups item; Mini PC model/RAM/OS for Deploy

## Known issues
- Sessions can't pull from Docker Hub; Docker is verified only in CI
- Sessions can't push tags (HTTP 403): `/checkpoint` tags stay local
- Next.js `next dev` re-creates AGENTS.md; it is committed to keep the tree clean
- Dev-only moderate minimatch ReDoS via `eslint-config-next` (`npm audit`): separate chore
