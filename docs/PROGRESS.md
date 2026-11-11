# Progress

> Rewritten (not appended) at the end of every session with `/wrap-up`. Keep under 40 lines.
> Git history keeps the old versions.

## Current state
Foundations merged (PR #1). `main` protected. Hosting decided: local server on the staff Wi-Fi,
optional Tailscale, nightly encrypted OneDrive backups (ADR 0003). Brief drafted: staff-only,
on-site bookings. No application code yet.

## Done this session
- Skeleton, agents and commands merged; branch ruleset scoped to `main`
- ADR 0003 rewritten for local hosting (Docker Compose, Caddy, UPS, Tailscale, rclone → OneDrive)
- ADR 0004: per-day occupancy, season passes (first day, released-day count), quick book,
  date view by line, 11:00 hold rule (season exempt, no-shows flagged by name); 2–3 sunbeds per umbrella
- PROJECT_BRIEF drafted; domain is Venue → Area → Spot, plus Customer (no login)

## Next up
1. Confirm the _(to confirm)_ items in docs/PROJECT_BRIEF.md
2. Accept or change the tech stack in ADR 0002
3. Roadmap item: "Scaffold app, lint/format, test runner, CI green"

## Open questions
- Interface language: Italian, English or both?
- Is storing encrypted backups on the company OneDrive OK with whoever manages Microsoft 365?
- Hardware: mini PC chosen yet?

## Known issues
- None
