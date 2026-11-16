# Progress

> Rewritten (not appended) at every `/wrap-up`. Keep under 40 lines. Git history keeps old versions.

## Current state
- `v0.4.0` deployed. Unreleased on `main`: #39 (activity + undo, ADR 0013, migration 0007).
  PR #40 (Android app, ADR 0010/0011) open, CI green; on no tablet yet.

## Done this session
- Android app, box build script, CI job `android`, RUNBOOK section; new roadmap item Phone layout.

## Next up
1. Merge #40, release `v0.5.0` (with #39; migration 0007 runs on update), deploy. Build the APK
   on the box, try it on the **oldest** tablet (bundled root on Android 7, sign-in, pinning).
2. Backups (USB + OneDrive; owner: M365 approval, USB in the box), incl. the Android signing key.
3. Move a booking to another spot or dates (log it for undo, ADR 0013); then Phone layout.

## Open questions
- Android: which versions the tablets run (min 7.0). Auto-retry on the retry screen for unattended
  tablets? `FLAG_SECURE` (hides customer data in Recents, but blocks staff screenshots)?
- Android supply chain: Gradle dependency verification, image digests; plugin 9.x upgrade.
- Caddy sends no Content-Security-Policy, and pages carry no `Cache-Control: no-store`: the
  WebView allow-list can't see WebSockets or sub-resource redirects; pages cache on tablets.
- ADR 0011: Tailscale terms for company use; who gets remote access (owner, which staff).
- GDPR: retention for customer data and the audit log, and a redaction path (needs an ADR).
  `audit_log` FKs are `on delete restrict`, so bookings/users can't be deleted once logged.
- Owner: activity shows cancelled bookings' names to all staff (or initials?); Italian undo is
  "Ripristina", since "Annulla" already means cancel a booking. OK?
- No rate limit on booking, suggest or undo actions; spots aren't checked against the area.
- Quick book: "Another suggestion" resets the form; 101 + 201 isn't offered over 101 + 103.
- Umbrellas with past bookings can never be removed (FK restrict): add "retire" before next season.
- Venue name accepts control chars; setup numbers accept `true`/`1e1`. `formatEur` in cents?
  Map opens on the first space (remember per tablet?); session length on shared tablets?
- Ruleset `rulset1` requires `docker` and `checks`: add `e2e`, `deploy-scripts` and `android`.
- RUNBOOK firewall example says `192.168.1.0/24`; the box is on `192.168.0.0/24`.
- E2E uses exactly 5 sign-ins (the per-minute limit): a CI retry of a login test can hit it.

## Known issues
- Sessions can't pull Docker images, push tags or reach Google Maven: Docker, e2e and the
  Android build run in CI only; tags on GitHub.
- Next.js `next dev` re-creates AGENTS.md; it is committed to keep the tree clean.
