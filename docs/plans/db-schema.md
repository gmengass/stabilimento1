# Plan: Database + first migration (Venue, Area, Spot), seed data

Roadmap: Milestone 0. Branch: `feat/db-schema`. Model: ARCHITECTURE.md "Core domain", ADR 0004.

## Goal
Migration 0002 creates venue, area, line and spot with DB-enforced integrity, `src/db/types.ts`
matches the schema, and an idempotent seed loads a realistic demo beach.

## Acceptance criteria (tests in `tests/integration/schema.test.ts` unless noted)
1. Migrating up creates `venue`, `area`, `area_line`, `spot`, the enum `spot_kind` and the function
   `set_updated_at()`. Migrating all the way down removes them, and migrating up again works
   (extends the round trip in `tests/integration/db.test.ts`).
2. Duplicate natural keys are rejected with 23505: venue `slug`, area `(venue_id, slug)`,
   line `(area_id, number)`, spot `(line_id, position)`, spot `(area_id, number)`.
   A spot whose `area_id` differs from its line's area is rejected (23503).
3. Check constraints reject (23514): line `number < 1`, spot `position < 1`, `included_sunbeds > max_sunbeds`,
   `max_sunbeds < 1`, blank names, and a `sunbed` spot whose included/max is not 1/1.
   An unknown `kind` is rejected (22P02).
4. Deleting a venue, area or line that still has children fails with 23503 (no cascades).
5. A new umbrella defaults to included 2 and max 3 (ADR 0004). `created_at`/`updated_at` are
   `timestamptz` (UTC) and an UPDATE moves `updated_at` forward.
6. Seed (`tests/integration/seed.test.ts`): a second run gives the same row counts and ids, and an
   extra spot added by hand survives a re-run. The seed refuses to run when `NODE_ENV=production`.
7. CI regenerates the types after migrating and fails if `src/db/types.ts` differs.

## Files
- `src/db/migrations/0002_venue_area_spot.ts`: `up`/`down` in the `0001_init.ts` style, plain SQL via
  `sql\`\`.execute(db)`, one statement per call, `db: Kysely<unknown>`
- `src/db/types.ts`: regenerated (or hand-written in codegen's shape, see step 3)
- `src/db/seed.ts` (CLI entry) and `src/db/seed-data.ts` (exports `seedDemo(db)` plus the demo layout)
- `package.json`: `db:seed`; add `--date-parser string` to `db:types` to match `src/db/client.ts`
- `tests/integration/schema.test.ts`, `tests/integration/seed.test.ts`, `tests/integration/db.test.ts`
- `.github/workflows/ci.yml`: after migrate, `npm run db:types` and `git diff --exit-code src/db/types.ts`
- `docs/ARCHITECTURE.md` (directory layout for `src/db/`), `docs/PROGRESS.md`

## Data changes (one transactional migration)
- Every table: `id integer generated always as identity primary key`,
  `created_at`/`updated_at timestamptz not null default now()`, BEFORE UPDATE trigger `set_updated_at()`
- `venue`: `name text`, `slug text unique` (check `^[a-z0-9-]+$`)
- `area`: `venue_id -> venue ON DELETE RESTRICT`, `name`, `slug`, `sort_order int default 0`, unique `(venue_id, slug)`
- `area_line`: `area_id -> area RESTRICT`, `number int check >= 1` (1 = shore), unique `(area_id, number)`.
  Named `area_line` because `line` is a built-in Postgres type.
- `spot`: `area_id`, `line_id`, FK `(line_id, area_id) -> area_line (id, area_id) RESTRICT`,
  `number int check >= 1` (the number staff use, unique per area), `position int check >= 1` (order in the line), `kind spot_kind ('umbrella','sunbed')`,
  `included_sunbeds smallint default 2`, `max_sunbeds smallint default 3`,
  `check (0 <= included_sunbeds and included_sunbeds <= max_sunbeds and max_sunbeds >= 1)`, a sunbed check,
  unique `(line_id, position)`, unique `(area_id, number)`. `area_line` gets unique `(id, area_id)` for the FK.
- No upper cap of 3: ADR 0004 lets max vary per umbrella. A pg enum gives codegen a union type.
- Down: drop spot, area_line, area, venue, then type `spot_kind` and function `set_updated_at`.
- RESTRICT means later tables (BookingSpot, SpotDay) can never lose history through a cascade.

## Risks and edge cases
- Type drift if `types.ts` is hand-written: AC 7 catches it in CI.
- pg's extended protocol rejects multi-statement strings: one `sql` call per statement.
- Seed against a real install would create a fake venue: production guard (AC 6).
- Shared test DB: `db.test.ts` migrates down to zero. Each suite migrates up in `beforeAll` and
  truncates `venue restart identity cascade` in `beforeEach`.
- No dates yet. Time zone and DST matter once Season/SpotDay arrive (ADR 0004).

## Steps (one commit each)
1. `test:` failing schema tests for AC 1–5
2. `feat:` migration 0002 (`/checkpoint` first); check the round trip with `db:migrate`/`db:rollback`
3. `chore:` types: local Postgres if available, then `npm run db:types`; else hand-write and let CI (AC 7) confirm
4. `test:` + `feat:` seed: one transaction, `insert ... on conflict (natural key) do nothing`, then select ids,
   never deletes. Demo: fictional "Lido Demo", area "Spiaggia principale" (`main`), 6 lines × 20 umbrellas
   at defaults (120 spots, numbered 1–120 from the shore), no standalone sunbeds
5. `ci:` types drift check
6. `docs:` ARCHITECTURE layout, PROGRESS

## Open questions
- Decided: staff use one umbrella number per area (`spot.number`). Alphanumeric labels ("A12") not supported yet.
- Retiring a spot that has bookings: soft-delete (`is_active`) or never delete? Decide in the admin CRUD item.
- VenueSettings (`time_zone`, `default_hold_until`): columns on `venue` or a 1:1 table? Deferred to the hold-rule item.
- Map coordinates and real club layout: deferred to the map item.
- Roadmap Milestone 1 (providers, working hours, customer search, email) contradicts the brief and ADR 0004.
