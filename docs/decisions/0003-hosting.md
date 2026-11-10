# 0003. Hosting and environments

- Status: Accepted (on merge of this PR)
- Date: 2026-11-10

## Context
- One beach club, with the option to add more booking areas later.
- 5–10 staff users in total, several working at the same time and updating bookings.
- The owner wants low maintenance, easy recovery from mistakes, and an open-source, self-hostable app.
- Users and data are in Europe (owner in the UK), so GDPR applies.

## Decision
- **App**: a managed platform that deploys automatically when changes are merged to `main`
  (Vercel or Render; the final choice is made in the "Deploy" roadmap item).
- **Database**: managed PostgreSQL (e.g. Neon) in an **EU region**, with automatic backups and
  point-in-time restore.
- **Environments**:
  - *Production*: deployed from `main`.
  - *Preview*: a temporary copy deployed for each pull request, with its own database branch and
    seed data. Real customer data never touches it.
- **Portability**: the repo also ships a `docker-compose.yml` (app + PostgreSQL), so anyone,
  including us, can self-host on a single server (option B) without code changes.
- **Live updates**: staff screens refresh changes within a few seconds (Server-Sent Events or
  short polling). No extra message broker at this scale.
- **Concurrency**: the database rejects overlapping bookings (exclusion constraint). Application
  checks are a convenience, not the guarantee.

## Alternatives considered
- **Own virtual server (Docker)**: cheapest and most portable, but you own patching, backups and
  uptime. It stays available via `docker-compose.yml`.
- **Supabase all-in-one**: fast to start, but it ties auth and live updates to one vendor's APIs.

## Consequences
- Code mistakes are undone with a Git revert; data mistakes with a database point-in-time restore.
- Expected cost at 5–10 users: free or low tiers. Revisit if usage grows a lot.
- Secrets are kept in the platform's environment settings and never in the repo.
