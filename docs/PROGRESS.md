# Progress

> Rewritten (not appended) at the end of every session with `/wrap-up`. Keep under 40 lines.
> Git history keeps the old versions.

## Current state
Auth merged (PR #8). It added Better Auth login (ADR 0007): username + password,
admin/staff roles, absolute 12 h sessions, `/login` public, everything else under `src/app/(app)/`.
Admins manage staff at `/admin/staff`. First admin via `npm run db:seed-admin`. Language saved on
the user. Auth HTTP API is an allowlist of 3 endpoints. 290 Vitest + 8 e2e pass locally.

## Done this session
- Plan `docs/plans/auth.md`; migration `0003_auth`; tester, reviewer and security passes
- Fixes from review: concurrent admin-disable lockout (advisory lock), endpoint allowlist,
  disabled = wrong password, IPv6 per-address rate limit, app port bound to 127.0.0.1
- ADR 0007, ARCHITECTURE (auth, authorization), ROADMAP ticked, CHANGELOG

## Next up
1. Umbrella numbering on `feat/umbrella-numbering` (decided with the owner, 2026-11-11):
   number = line × 100 + position, e.g. line 1: 101–118, line 2: 201… Position 1 is the
   leftmost umbrella when facing the sea, in every line. Default rule, not a DB constraint
   (odd numbers stay possible). No migration: update seed formula (`src/db/seed-data.ts:71`)
   and seed test, record the rule and map orientation in PROJECT_BRIEF and ADR 0004
2. Docs PR: rewrite Roadmap Milestone 1 to match the brief and ADR 0004
3. Deploy item: Caddy in front (sets X-Forwarded-For), `trustedProxies`, `APP_URL` https

## Open questions
- Session length on shared tablets: 12 h absolute now; end of day (Europe/Rome) instead?
- Password policy is length-only (10–128); staff can't change their own password
- Expired `session` rows (IP, user agent) are never deleted: cleanup job + retention (GDPR)
- `formatEur` takes euros; switch to integer cents before the Prices item?
- VenueSettings: columns on `venue` or a 1:1 table? Hold-rule item
- Ruleset `rulset1` requires `docker` only: add `checks` and `e2e` too
- Mini PC deploy: Docker Engine in WSL2 at boot vs Docker Desktop; amend ADR 0003

## Known issues
- Sessions can't pull from Docker Hub or download Playwright browsers: run e2e locally with a
  config override using `/usr/bin/google-chrome`; Docker is verified only in CI
- Sessions can't push tags (HTTP 403): `/checkpoint` tags stay local
- Next.js `next dev` re-creates AGENTS.md; it is committed to keep the tree clean
