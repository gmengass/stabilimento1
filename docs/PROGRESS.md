# Progress

> Rewritten (not appended) at the end of every session with `/wrap-up`. Keep under 40 lines.
> Git history keeps the old versions.

## Current state
Auth merged (PR #8). Branch `feat/umbrella-numbering` sets umbrella numbers to line × 100 +
position (line 1: 101…, line 2: 201…), position 1 = leftmost facing the sea (ADR 0004). Default
rule only, no migration, no DB constraint. 290 Vitest pass; lint, types, format clean.

## Done this session
- Seed formula (`src/db/seed-data.ts`) and seed test with boundary checks (101, 118, 201, 618); demo is 6 lines × 18 = 108
- Rule recorded in ADR 0004, PROJECT_BRIEF, ARCHITECTURE, CHANGELOG; ROADMAP item ticked

## Next up
1. Merge the `feat/umbrella-numbering` PR once CI is green
2. Docs PR: rewrite Roadmap Milestone 1 to match the brief and ADR 0004
3. Deploy item: Caddy in front (sets X-Forwarded-For), `trustedProxies`, `APP_URL` https

## Open questions
- Existing dev databases keep the old 1–120 numbers (seed never updates rows): re-create the DB
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
