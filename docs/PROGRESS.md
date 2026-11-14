# Progress

> Rewritten (not appended) at every `/wrap-up`. Keep under 40 lines. Git history keeps old versions.

## Current state
- `v0.2.1` is tagged and deployed on the club box (Windows + WSL2).
- Merged, not in a tagged release: #12 `setup-wsl.sh` without `sg`, #19 tracker, #21 CI skips the
  heavy jobs on docs-only pull requests.
- Open PR `feat/season-passes` (migration `0006_seasons`) ticks Roadmap Milestone 1 item 4.

## Done this session
- Seasons (one per year), season passes with an optional last day, release and give back
  (`docs/plans/season-passes.md`). E2E test `e2e/season-pass.spec.ts`.

## Next up
1. Review and merge `feat/season-passes`, then tag a release and update the box.
2. Quick book: name, phone, umbrellas, sunbeds → suggested spots, one-tap confirm.
3. Backups (USB + OneDrive) before the first real season. Share the lock with `update.sh`.
4. Trusted certificate: Android Chrome blocks the internal-CA cert with no "Proceed". Let's Encrypt
   via DNS-01 on the club's domain (new ADR amending ADR 0008). Ask the owner: domain, DNS host.

## Open questions
- GDPR: retention period for customer name/phone/notes, and a redaction path (needs an ADR).
- No AuditLog yet (ADR 0004): bookings and pass changes write no entry. Needed before payments.
- Any staff member can set a pass's last day (it frees later days for good): admin-only?
- Day and multi-day bookings can still be created for past days (pre-existing; passes can't).
- No rate limit on booking actions; spots aren't checked against the area.
- Umbrellas with past bookings can never be removed (FK restrict): add "retire" before next season.
- Venue name accepts control characters; setup numbers accept `true`/`1e1` (bounds still hold).
- The map opens on the first space: remember each tablet's last space (cookie)?
- Dev-only 'uncached data' overlay on every page (also /admin/staff, predates this work).
- Session length on shared tablets: 12 h absolute, or end of day (Europe/Rome)?
- `formatEur` takes euros: switch to cents before the Prices item?
- Ruleset `rulset1` requires `docker` only: add `checks`, `e2e` and `deploy-scripts`.
- RUNBOOK firewall example says `192.168.1.0/24`; the box is on `192.168.0.0/24`.
- CHANGELOG has everything under "Unreleased": split into v0.1.0 … v0.2.1; add the #12 fix.

## Known issues
- Sessions can't pull Docker images or push tags (HTTP 403): Docker/e2e run in CI, tags on GitHub.
- Next.js `next dev` re-creates AGENTS.md; it is committed to keep the tree clean.
