# Progress

> Rewritten (not appended) at every `/wrap-up`. Keep under 40 lines. Git history keeps old versions.

## Current state
- `v0.3.1` is tagged (#28: beach space tabs on the date row); deploy on the box not confirmed.
  `v0.3.0` (seasons and season passes, #26, migration `0006_seasons`) is deployed on the box.
- Merged, not yet tagged: #29 (the map's date controls stay together on one line) and #31.

## Done this session
- #31: a picked calendar day opens at once, no Show button (`src/components/date-jump.tsx`);
  other days show an amber "Go to today". #29: e2e specs share one sign-in (`e2e/admin.setup.ts`).

## Next up
1. Backups: nightly encrypted dumps to USB + OneDrive, before the first real season. Ask the
   owner: OneDrive approval from whoever runs Microsoft 365, and a USB drive left in the box.
2. Quick book: name, phone, umbrellas, sunbeds → suggested spots, one-tap confirm.
3. Trusted certificate: Android Chrome blocks the internal-CA cert with no "Proceed". Let's Encrypt
   via DNS-01 on the club's domain (new ADR amending ADR 0008). Ask the owner: domain, DNS host.

## Open questions
- GDPR: retention period for customer name/phone/notes, and a redaction path (needs an ADR).
- No AuditLog yet (ADR 0004): bookings and pass changes write no entry. Needed before payments.
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
- CHANGELOG has everything under "Unreleased": split into v0.1.0 … v0.3.1.
- E2E uses exactly 5 sign-ins (the per-minute limit): a CI retry of a login test can hit it.

## Known issues
- Sessions can't pull Docker images or push tags (HTTP 403): Docker/e2e run in CI, tags on GitHub.
- Next.js `next dev` re-creates AGENTS.md; it is committed to keep the tree clean.
