# Progress

> Rewritten (not appended) at the end of every session with `/wrap-up`. Keep under 40 lines.
> Git history keeps the old versions.

## Current state
- PR #10 (`feat/deploy`) is open with CI green.
  - It adds Caddy HTTPS (internal CA), auth that trusts only `X-Real-IP`, strict `TRUSTED_ORIGINS`,
    the update/rollback scripts and the RUNBOOK.
  - Decisions: ADR 0003 (amended: WSL2 now, native Linux later) and ADR 0008. 326 tests pass.

## Done this session
- ADR 0008 and `docs/plans/deploy.md`.
- CI: HTTPS health check, port 3000 closed, spoofed headers still hit 429, shellcheck, and an
  end-to-end install → update → rollback with a data check.
- Review fixes: rollback after a failed update, owner-only dumps (3 kept), and RUNBOOK checks for
  the CA key, firewall and network.

## Next up
1. Merge PR #10, then tag `v0.1.0` from GitHub (sessions can't push tags). Run the RUNBOOK on the box.
2. Backups item: nightly encrypted pg_dump to OneDrive (rclone), retention, restore test, alert.
   Share the lock with `update.sh`. Back up `caddy_data` too.
3. Docs PR: rewrite Roadmap Milestone 1 to match the brief and ADR 0004.

## Open questions
- Verify on the box: does WSL2 mirrored networking keep LAN source IPs (RUNBOOK check)?
- Hardening for later: a shared-secret header from Caddy to the app, the db port in a dev-only
  file, signed tags, the Caddy image pinned by digest, a per-username lockout, keep-data rollback.
- Existing dev databases keep the old 1–120 numbers: re-create the DB.
- Session length on shared tablets: 12 h absolute, or end of day (Europe/Rome)?
- Password policy is length-only, staff can't change their own password, and expired sessions are
  never deleted (GDPR cleanup).
- `formatEur` takes euros: switch to cents before the Prices item? VenueSettings: columns or 1:1?
- Ruleset `rulset1` requires `docker` only: add `checks`, `e2e` and `deploy-scripts`.

## Known issues
- Sessions can't pull Docker images, download Playwright browsers or push tags (HTTP 403).
  Docker and e2e are verified in CI, and releases are tagged on GitHub.
- Next.js `next dev` re-creates AGENTS.md; it is committed to keep the tree clean.
