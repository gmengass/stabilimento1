# Progress

> Rewritten (not appended) at the end of every session with `/wrap-up`. Keep under 40 lines.
> Git history keeps the old versions.

## Current state
DB schema merged (PR #6). Branch `feat/i18n` adds next-intl (IT default, EN) without URL locales:
locale from `locale` cookie → `it` (`src/i18n/`), switcher in the root layout header, typed message
keys, `formatBookingDate`/`formatEur`, lint rule against JSX string literals, Playwright e2e in CI.
Root layout renders per request (ADR 0006). 115 Vitest tests + 2 e2e pass locally.

## Done this session
- Plan `docs/plans/i18n.md`; `setLocale` server action (Zod, httpOnly, Lax, Secure in prod)
- Message parity/placeholder test; `resolveLocale` ready for a user preference (Auth)
- Playwright added (`npm run test:e2e`), CI `e2e` job; reviewer + security passed after fixes
- ADR 0006 (per-request rendering); ARCHITECTURE layout and Rendering section

## Next up
1. Open and merge the `feat/i18n` PR once CI (incl. the new e2e job) is green
2. "Auth (sign up, log in, roles)" on `feat/auth`: add `user.locale`, save it in `setLocale`
3. Docs PR: rewrite Roadmap Milestone 1 to match the brief and ADR 0004

## Open questions
- Roadmap Milestone 1 (providers, working hours, customer search, email) contradicts the brief
  and ADR 0004: rewrite it in a docs PR
- Alphanumeric umbrella labels ("A12")? Only integers for now
- Retiring a spot that has bookings: soft-delete or never delete? Decide in the admin CRUD item
- VenueSettings (time zone, hold-until): columns on `venue` or a 1:1 table? Hold-rule item
- Ruleset `rulset1` requires `docker` only: add `checks` and `e2e` too
- Pin GitHub Actions to commit SHAs (security, low)
- Home page `i18n-probe` input is test-only: move the e2e to a real form when one exists
- OneDrive backup permission: shelved until the Backups item
- Mini PC: Windows 11, Ryzen 5 7430U (assumed), 16 GB. Deploy item: Docker Engine in WSL2 started
  at boot (preferred) vs Docker Desktop + auto-login; amend ADR 0003

## Known issues
- Sessions can't pull from Docker Hub or download Playwright browsers: run e2e locally with a
  config override using `/usr/bin/google-chrome`; Docker is verified only in CI
- Sessions can't push tags (HTTP 403): `/checkpoint` tags stay local
- Next.js `next dev` re-creates AGENTS.md; it is committed to keep the tree clean
