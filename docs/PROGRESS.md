# Progress

> Rewritten (not appended) at the end of every session with `/wrap-up`. Keep under 40 lines.
> Git history keeps the old versions.

## Current state
Foundations merged (PR #1). `main` protected by a ruleset (PR required, CI required, no force
push, no deletion). Hosting decided (ADR 0003). No application code yet.

## Done this session
- Skeleton, agents and commands merged to `main`
- Branch ruleset scoped to the default branch only
- ADR 0003: managed app platform + managed EU PostgreSQL, per-PR previews, Docker for self-hosting
- Domain updated: Venue → Area → Spot (one club, more areas possible; 5–10 staff)

## Next up
1. Fill in docs/PROJECT_BRIEF.md (who books what, payments, staff needs)
2. Accept or change the tech stack in ADR 0002
3. Roadmap item: "Scaffold app, lint/format, test runner, CI green"

## Open questions
- Do customers book online themselves, or do only staff enter bookings?
- Booking units: full day, half day, multi-day or season passes?
- Payments in v1?

## Known issues
- None
