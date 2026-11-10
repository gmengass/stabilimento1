# 0002. Tech stack

- Status: **Proposed** (needs owner approval)
- Date: 2026-11-10

## Context
We need a widely used, open-source, self-hostable stack with strong typing, good testing tools,
and a database that can enforce "no overlapping bookings".

## Proposed decision
| Layer | Choice | Why |
|-------|--------|-----|
| Language | TypeScript | One language front to back, typed |
| Web framework | Next.js (App Router) | Full-stack, large community |
| Database | PostgreSQL | Exclusion constraints prevent double booking |
| ORM / migrations | Prisma or Drizzle (decide at scaffold) | Typed queries, versioned migrations |
| Auth | Auth.js | Open source, many providers |
| Tests | Vitest (unit/integration), Playwright (e2e) | Fast, standard |
| Lint/format | ESLint + Prettier | Standard |
| Email | Nodemailer + any SMTP | No vendor lock-in |
| Payments (optional) | Stripe Checkout | Hosted flow, no card data stored |
| Deploy | Docker Compose (self-host); Vercel/Fly/Render optional | Open-source friendly |
| CI | GitHub Actions | Free for public repos |

## Alternatives considered
- Python/Django: excellent admin panel and batteries included. A good choice if you prefer Python.
- Laravel (PHP): mature, cheap hosting.
- Fork an existing open-source scheduler (e.g. Cal.com, Easy!Appointments): fastest route if the
  use case is plain appointments, but less of your own design.

## Consequences
Once this ADR is accepted, CLAUDE.md "Commands" and the CI workflow get filled in for this stack.
