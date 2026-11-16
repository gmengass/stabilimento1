# Progress

> Rewritten (not appended) at every `/wrap-up`. Keep under 40 lines. Git history keeps old versions.

## Current state
- `v0.4.0` deployed. PR #40 (Android app, ADR 0010/0011) open; not on any tablet yet.

## Done this session
- Android wrapper app (`android/`), box build script (`scripts/build-android.sh`), CI job
  `android`, RUNBOOK section. Reviewer + security findings fixed. New roadmap item: Phone layout.

## Next up
1. Merge #40, build the APK on the box, install it on the **oldest** tablet: check the WebView
   accepts the bundled root (Android 7) and that sign-in, booking and screen pinning work.
2. Backups (USB + OneDrive), now also for the Android signing key in `~/secrets`.
3. Move a booking to another spot or dates; then Phone layout (bottom sheet, phone-width e2e).

## Open questions
- Android: which versions the tablets run (min 7.0). Auto-retry on the retry screen for unattended
  tablets? `FLAG_SECURE` (hides customer data in Recents, but blocks staff screenshots)?
- Android supply chain: Gradle dependency verification metadata, and `gradle`/`caddy` images
  pinned by digest (can't be generated in a session). Upgrade to Android Gradle plugin 9.x.
- Caddy sends no Content-Security-Policy, and pages carry no `Cache-Control: no-store`: the
  WebView allow-list can't see WebSockets or sub-resource redirects; pages cache on tablets.
- ADR 0011: Tailscale terms for company use; who gets remote access (owner, which staff).
- GDPR: retention period for customer name/phone/notes, and a redaction path (needs an ADR).
- No AuditLog yet (ADR 0004): bookings and pass changes write no entry. Needed before payments.
- No rate limit on booking or suggest actions; spots aren't checked against the area.
- Quick book: "Another suggestion" resets the form; 101 + 201 isn't offered over 101 + 103.
- Umbrellas with past bookings can never be removed (FK restrict): add "retire" before next season.
- Venue name accepts control characters; setup numbers accept `true`/`1e1`. `formatEur` in cents?
- Map opens on the first space (remember per tablet?); session length on shared tablets?
- Ruleset `rulset1` requires `docker` only: add `checks`, `e2e`, `deploy-scripts`, `android`.
- RUNBOOK firewall example says `192.168.1.0/24`; the box is on `192.168.0.0/24`.
- E2E uses exactly 5 sign-ins (the per-minute limit): a CI retry of a login test can hit it.

## Known issues
- Sessions can't pull Docker images, push tags or reach Google Maven: Docker, e2e and the
  Android build run in CI only; tags on GitHub.
- Next.js `next dev` re-creates AGENTS.md; it is committed to keep the tree clean.
