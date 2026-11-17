# Progress

> Rewritten (not appended) at every `/wrap-up`. Keep under 40 lines. Git history keeps old versions.

## Current state
- `v0.5.1` released and deployed (activity + undo, Android app, `DEFAULT_SNI` fix #43).
  #44 merged (RUNBOOK: restart Caddy after `DEFAULT_SNI`). Open: #45 phone layout (below).

## Done this session
- Phone layout (`docs/plans/phone-layout.md`): bottom sheet below 768px, tap targets ≥ 44px,
  keyboard resizes the layout; Playwright `phone` project (390×844).

## Next up
1. Merge the phone PR (#45). Try the sheet + keyboard on a phone and the oldest tablet.
2. Check `https://stabilimento.local/health` in the tablet's Chrome; back up the Android signing
   key; backups (USB + OneDrive; owner: M365 approval, USB in the box).
3. Move a booking to another spot or dates (log it for undo, ADR 0013).

## Open questions
- Phones: should portrait tablets (768–1023px) get the sheet too? Should the activity panel
  start folded on phones? The sheet covers Undo until staff scroll or collapse it.
- Android: tablet versions (min 7.0; does its WebView honour `interactive-widget`?). Auto-retry
  on the retry screen? `FLAG_SECURE` (hides data in Recents, blocks staff screenshots)?
- Android supply chain: Gradle dependency verification, image digests; plugin 9.x upgrade.
- No CSP from Caddy, no `Cache-Control: no-store` (WebView allow-list misses WebSockets; caching).
- ADR 0011: Tailscale terms for company use; who gets remote access (owner, which staff).
- GDPR: retention for customer data and the audit log, and a redaction path (needs an ADR).
  `audit_log` FKs are `on delete restrict`, so bookings/users can't be deleted once logged.
- Owner: cancelled bookings' names shown to all staff (initials?); undo "Ripristina"? No rate
  limit on booking, suggest or undo; spots aren't checked against the area.
- Quick book: "Another suggestion" resets the form; 101 + 201 isn't offered over 101 + 103.
- Umbrellas with past bookings can't be removed (FK restrict): add "retire" before next season.
- Venue name accepts control chars; setup numbers accept `true`/`1e1`. `formatEur` in cents?
  Map opens on the first space (remember per tablet?); session length on shared tablets?
- Ruleset `rulset1` requires `docker`, `checks`: add `e2e`, `deploy-scripts`, `android`. RUNBOOK
  firewall says `192.168.1.0/24` (box: `.0.0/24`). E2E uses all 5 sign-ins/minute (CI retries).

## Known issues
- Sessions can't pull Docker images, reach Google Maven or push tags: build in CI, tag on GitHub.
- Next.js `next dev` re-creates AGENTS.md; it is committed to keep the tree clean.
