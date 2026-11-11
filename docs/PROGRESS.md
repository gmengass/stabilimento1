# Progress

> Rewritten (not appended) at the end of every session with `/wrap-up`. Keep under 40 lines.
> Git history keeps the old versions.

## Current state
Scaffold done on `feat/scaffold` (PR #4, CI green): Next.js 16.4.6, TypeScript 5.9, Tailwind 4,
Kysely 0.29 + pg, Zod 4, Vitest 5, ESLint 9 + Prettier. Exact versions in `package-lock.json`.
`/health` checks the DB. Compose stack (db, migrate, app) is smoke-tested in CI.
No domain tables yet.

## Done this session
- Scaffold per docs/plans/scaffold.md; CLAUDE.md "Commands" filled in
- Test safety: all test DB access is forced onto a `*_test` database (tests/setup.ts)
- `date` columns come back as `YYYY-MM-DD` strings (ADR 0004)
- ADR 0005 (Accepted): Italian + English via next-intl, switchable on every screen
- Roadmap: added "Interface languages" item before Auth

## Next up
1. PR #4 merged; ADR 0005 accepted (switcher before and after login)
2. "Database + first migration (Venue, Area, Spot), seed data" on `feat/db-schema`
3. Then "Interface languages (IT/EN)" on `feat/i18n`

## Open questions
- Ruleset `rulset1` requires `docker` only: add `checks` too
- OneDrive backup permission: shelved until the Backups item
- Mini PC: acquired. Model, RAM and OS needed for the Deploy item

## Known issues
- Sessions can't pull from Docker Hub; Docker is verified only in CI
- Next.js `next dev` re-creates AGENTS.md; it is committed to keep the tree clean
