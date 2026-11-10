# CLAUDE.md — Project rules for Claude

This file is loaded automatically at the start of every Claude session.
Keep it short. Details live in `docs/`.

## What this project is
An open-source booking application (MIT licensed). Scope, users and features:
`docs/PROJECT_BRIEF.md`. Current state: `docs/PROGRESS.md`. Plan: `docs/ROADMAP.md`.
Tech decisions: `docs/decisions/` (ADRs). Never contradict an accepted ADR. Propose a new one instead.

## Session protocol (prevents chat fatigue)
1. **Start**: read `docs/PROGRESS.md` and the current milestone in `docs/ROADMAP.md`. Do NOT
   re-read the whole codebase; open only the files the current task touches.
2. **Work on one roadmap item per session**, on its own branch `feat/<short-name>`.
3. **End**: run `/wrap-up` so that `docs/PROGRESS.md` is rewritten (not appended) with: what was done,
   what's next, and any open questions, then commit.
4. If a chat gets long (many back-and-forths, or a topic change), wrap up and start a fresh chat.
   PROGRESS.md carries the context, not the chat history.

## Communication rules
- Never repeat unchanged code back. Refer to `path/to/file.ts:42` and show only the diff or new lines.
- Never re-explain a decision already recorded in an ADR. Link it.
- Summaries are at most 5 bullets. No restating what the user just said.
- Ask at most one clarifying question at a time, and only when a wrong guess is expensive.
- If something is unclear or out of scope, add it to "Open questions" in PROGRESS.md and keep going.

## Development loop (each roadmap item)
1. **Plan**: `planner` agent writes a short plan in the PR description or `docs/plans/<item>.md`.
2. **Test first where practical**: `tester` agent writes failing tests for the acceptance criteria.
3. **Implement** in small commits.
4. **Verify**: run the full test + lint suite. Failures go to the `debugger` agent.
5. **Review**: `reviewer` agent; `security` agent for anything that touches auth, payments,
   personal data or user input.
6. **Merge** to `main` via PR only after CI is green. Tag releases `vX.Y.Z`.

## Safety and reverting (non-negotiable)
- Never commit directly to `main`. Never force-push. Never `git reset --hard` on shared branches.
- Before a risky change (migration, big refactor, dependency upgrade): `/checkpoint`.
- Commits follow Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`).
- Database changes only via migrations that also have a down/rollback path.
- Never commit secrets. Use `.env` (gitignored) and keep `.env.example` up to date.

## Code standards
- Stack: see `docs/decisions/0002-tech-stack.md`.
- Small functions, typed interfaces, no dead code, no commented-out code.
- Every feature ships with tests. Booking logic (availability, overlaps, time zones,
  cancellations) needs edge-case tests: double booking, DST changes, concurrent requests.
- Store times in UTC; convert only at the edges (UI / notifications).

## Commands
(Fill in once the stack is set up.)
- Install: `TBD`
- Dev server: `TBD`
- Test: `TBD`
- Lint/format: `TBD`
