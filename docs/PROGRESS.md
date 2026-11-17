# Progress

> Rewritten (not appended) at every `/wrap-up`. Keep under 40 lines. Git history keeps old versions.

## Current state
- `v0.6.0` released and deployed (phone layout #45, RUNBOOK #44; no migrations).
- Draft PR #48 (move a booking, ADR 0014, migration 0008): reviewed, CI green, not merged.

## Done this session
- Move a booking (`docs/plans/move-booking.md`): umbrellas and/or dates, one `move` entry, undo.

## Next up
1. Merge PR #48 (mark ready), release `v0.7.0` (has migration 0008: back up first), deploy.
2. Try the sheet + keyboard on a phone and the oldest tablet; check `/health` in the tablet's
   Chrome; back up the Android signing key; backups (USB + OneDrive; owner: M365, USB in box).
3. Check-in and the 11:00 hold rule (no-shows flagged on the map, restore).

## Open questions
- Moves: change the umbrella count, a pass's first day or a started booking's end (refused now)?
- Phones: sheet for portrait tablets (768–1023px)? Activity folded on phones (sheet covers Undo)?
- Android: tablet versions (min 7.0; does its WebView honour `interactive-widget`?). Auto-retry
  on the retry screen? `FLAG_SECURE` (hides data in Recents, blocks staff screenshots)?
- Android supply chain (Gradle verification, image digests, plugin 9.x). No CSP from Caddy, no
  `Cache-Control: no-store` (WebView allow-list misses WebSockets; caching).
- ADR 0011: Tailscale terms for company use; who gets remote access (owner, which staff).
- GDPR: retention for customer data and the audit log, and a redaction path (needs an ADR).
  `audit_log` FKs are `on delete restrict`, so bookings/users can't be deleted once logged.
- Owner: cancelled bookings' names shown to all staff (initials?); undo "Ripristina"? No rate
  limit on booking, suggest, move or undo; new bookings don't check spots against the area.
- Quick book: "Another suggestion" resets the form; 101 + 201 isn't offered over 101 + 103.
- Umbrellas with past bookings can't be removed (FK restrict): add "retire" before next season.
- Venue name accepts control chars; setup numbers accept `true`/`1e1`. `formatEur` in cents?
  Map opens on space 1 (remember per tablet?); session length on shared tablets?
- Ruleset `rulset1` requires `docker`, `checks`: add `e2e`, `deploy-scripts`, `android`. RUNBOOK
  firewall says `192.168.1.0/24` (box: `.0.0/24`). E2E uses all 5 sign-ins/minute (CI retries).

## Known issues
- Sessions can't pull Docker images, reach Google Maven or push tags (checkpoint tag unpushed).
- Next.js `next dev` re-creates AGENTS.md; it is committed to keep the tree clean.
