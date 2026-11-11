# 0002. Tech stack

- Status: Accepted
- Date: 2026-11-11 (proposed 2026-11-10; revised for local hosting, ADR 0003)

## Context
We need a widely used, open-source, self-hostable stack with strong typing and good testing tools.
It must run in Docker on a small local server (ADR 0003) and let the database enforce
"one booking per spot per day" (ADR 0004). Migrations must have a rollback path (CLAUDE.md).

## Decision
| Layer | Choice | Why |
|-------|--------|-----|
| Runtime | Node.js 24 LTS | Current LTS; one language front to back |
| Language | TypeScript (strict) | Typed |
| Web framework | Next.js (App Router), `output: "standalone"` | Full-stack, large community, small Docker image |
| Database | PostgreSQL 17 | Unique and partial indexes, transactions, `LISTEN/NOTIFY` for live updates |
| Queries | Kysely | Typed SQL builder, close to plain SQL, no hidden behavior |
| Migrations | Kysely migrator (`up` + `down` per file) | Meets the rollback rule; plain SQL inside |
| DB types | `kysely-codegen` generated from the migrated DB | The schema lives in one place: migrations |
| Auth | Better Auth (username + password, DB sessions, admin/staff roles) | Open source, Kysely support, no external service |
| Validation | Zod | One schema for forms and server actions |
| UI | Tailwind CSS | Fast to build a touch-friendly map UI |
| Live updates | Server-Sent Events fed by Postgres `LISTEN/NOTIFY` | No extra services (ADR 0003) |
| Scheduled jobs | In-app minute ticker (11:00 hold rule) + host cron for backups | Simple; no queue system |
| Tests | Vitest (unit + integration against a real Postgres), Playwright (e2e) | Fast, standard |
| Lint/format | ESLint + Prettier | Standard |
| Package manager | npm, with `package-lock.json` committed | Reproducible installs |
| Deploy | Docker Compose: app + Postgres + Caddy (ADR 0003) | Self-hosted |
| CI | GitHub Actions with a Postgres service container | Free for public repos |

Not used in v1: payments (Stripe), email providers, any hosted platform.

## Alternatives considered
- Prisma / Drizzle: good DX, but partial unique indexes and down-migrations are awkward. With
  Kysely the constraints are plain SQL.
- Auth.js: its credentials (password) login is discouraged and has no DB sessions.
- Python/Django: excellent admin, but splits the language between front end and back end.

## Consequences
- CLAUDE.md "Commands" and CI are filled in by the scaffold item (`docs/plans/scaffold.md`).
- Exact package versions are pinned in `package-lock.json` at install time.
