# Progress

> Rewritten (not appended) at the end of every session with `/wrap-up`. Keep under 40 lines.
> Git history keeps the old versions.

## Current state
- PR #10 (`feat/deploy`) is open with CI green. It contains:
  - Caddy HTTPS with an internal CA, IPv4-only, security headers
  - auth trusts only `X-Real-IP`, plus strict `TRUSTED_ORIGINS`
  - `update.sh` / `rollback.sh` / `pre-update-backup.sh`
  - RUNBOOK for WSL2 and native Linux
- Server OS (ADR 0003, amended): Docker Engine in WSL2 now, native Linux later.
- Deploy details: ADR 0008. 326 Vitest tests pass.

## Done this session
- ADR 0003 amended with the server OS decision. ADR 0008 added. Plan in `docs/plans/deploy.md`.
- CI checks:
  - HTTPS health check via Caddy's root certificate
  - port 3000 closed
  - spoofed IP headers still hit 429
  - shellcheck
  - an end-to-end install → update → rollback with a data check
- Reviewer fixes: rollback after a failed update, and retries can't overwrite the good dump.
- Security fixes: owner-only dumps (3 kept), CA key handling, firewall and network checks.

## Next up
1. Merge PR #10, then tag `v0.1.0` from GitHub (sessions can't push tags). Run the RUNBOOK on the box.
2. Backups item: nightly encrypted pg_dump to OneDrive (rclone), retention, restore test, alert.
   Share the lock with `update.sh`. Back up `caddy_data` too.
3. Docs PR: rewrite Roadmap Milestone 1 to match the brief and ADR 0004.

## Open questions
- Verify on the box: does WSL2 mirrored networking keep LAN source IPs (RUNBOOK check)?
- Should Caddy add a shared-secret header that the app checks? It would block direct access to the
  container IP from the box itself.
- Move the db host port (127.0.0.1:5432) into a dev-only compose file? Windows can reach it.
- Sign release tags and `git verify-tag` in `update.sh`? Pin the Caddy image by digest?
- Add a per-username sign-in lockout? Better Auth limits by IP only.
- Keep-data rollback (`migrate down`) mode? Auto-rollback on a failed health check?
- Existing dev databases keep the old 1–120 numbers: re-create the DB.
- Session length on shared tablets: 12 h absolute, or end of day (Europe/Rome)?
- Password policy is length-only, and staff can't change their own password.
- Expired `session` rows are never deleted: cleanup job + retention (GDPR).
- `formatEur` takes euros: switch to cents before the Prices item? VenueSettings: columns or 1:1?
- Ruleset `rulset1` requires `docker` only: add `checks`, `e2e` and `deploy-scripts`.

## Known issues
- Sessions can't pull from Docker Hub or download Playwright browsers. Docker and e2e are verified
  in CI.
- Sessions can't push tags (HTTP 403): `/checkpoint` tags stay local, and releases are tagged on GitHub.
- Next.js `next dev` re-creates AGENTS.md; it is committed to keep the tree clean.
