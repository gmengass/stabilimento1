# Progress

> Rewritten (not appended) at the end of every session with `/wrap-up`. Keep under 40 lines.
> Git history keeps the old versions.

## Current state
Scaffold merged (PR #4). Branch `feat/db-schema` adds migration 0002: `venue`, `area`,
`area_line`, `spot` (enum `spot_kind`, `set_updated_at()` trigger), no cascading deletes.
`src/db/types.ts` is generated; CI fails if it drifts. Demo seed: `npm run db:seed`
(Lido Demo, 6 lines × 20 umbrellas, numbers 1–120). 58 tests pass locally.

## Done this session
- Plan `docs/plans/db-schema.md`; decided: one umbrella number per area (`spot.number`)
- Migration 0002 with up/down, constraint tests (unique keys, checks, FK, concurrency)
- Idempotent seed with production guard; `db:types` now uses `--date-parser string`
- CI: types drift check; docker job expects `Success down 0002_venue_area_spot`
- Roadmap: scaffold and db-schema ticked; ARCHITECTURE directory layout filled in

## Next up
1. Merge the `feat/db-schema` PR once CI is green
2. "Interface languages (IT/EN)" on `feat/i18n` (ADR 0005)
3. Then "Auth (sign up, log in, roles)"

## Open questions
- Roadmap Milestone 1 (providers, working hours, customer search, email) contradicts the brief
  and ADR 0004: rewrite it in a docs PR
- Alphanumeric umbrella labels ("A12")? Only integers for now
- Retiring a spot that has bookings: soft-delete or never delete? Decide in the admin CRUD item
- VenueSettings (time zone, hold-until): columns on `venue` or a 1:1 table? Hold-rule item
- Ruleset `rulset1` requires `docker` only: add `checks` too
- OneDrive backup permission: shelved until the Backups item
- Mini PC: model, RAM and OS needed for the Deploy item

## Known issues
- Sessions can't pull from Docker Hub; Docker is verified only in CI
- Sessions can't push tags (HTTP 403): `/checkpoint` tags stay local
- Next.js `next dev` re-creates AGENTS.md; it is committed to keep the tree clean
