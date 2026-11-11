# Plan: scaffold app, lint/format, test runner, CI green

Roadmap: Milestone 0. Branch: `feat/scaffold`. Stack: ADR 0002.

## Goal
An empty but production-shaped app: it builds, lints, type-checks and runs one unit test and one
database integration test, locally in Docker and in CI.

## Acceptance criteria
- `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` pass locally and in CI.
- `docker compose up` starts the app + Postgres. `http://localhost:3000/health` returns
  `{ "status": "ok", "db": "ok" }`.
- `npm run db:migrate` / `npm run db:rollback` apply and undo a first empty migration.
- CI runs on every PR with a Postgres service and is required on `main` (ruleset already exists).
- CLAUDE.md "Commands" filled in. `package-lock.json` committed.

## Files
- `package.json` scripts: dev, build, start, lint, format, typecheck, test, test:watch,
  db:migrate, db:rollback, db:types
- `tsconfig.json` (strict), `eslint.config.mjs`, `.prettierrc`, `vitest.config.ts`
- `next.config.ts` (`output: "standalone"`)
- `src/app/layout.tsx`, `src/app/page.tsx` (placeholder), `src/app/health/route.ts`
- `src/db/client.ts` (Kysely + pg pool), `src/db/migrate.ts`, `src/db/migrations/0001_init.ts`
- `src/lib/env.ts` (Zod-validated env)
- `tests/unit/env.test.ts`, `tests/integration/db.test.ts`
- `Dockerfile` (multi-stage, non-root), `docker-compose.yml` (app, postgres:17, volume),
  `docker-compose.test.yml`
- `.github/workflows/ci.yml`: Node 24, Postgres service, `npm ci`, lint, typecheck, migrate,
  test, build
- `.nvmrc` (24), `.env.example` (update)

## Risks
- Next.js and Better Auth versions move fast. Pin exact versions and record them in the PR.
- Integration tests must use a separate database (`booking_test`), never the dev one.

## Steps (one commit each)
1. Next.js + TypeScript + Tailwind skeleton, lint/format config
2. Env validation + unit test (Vitest)
3. Kysely client, migrator, empty migration with up/down, integration test
4. Health route
5. Dockerfile + compose files
6. CI workflow
7. CLAUDE.md commands, PROGRESS.md
