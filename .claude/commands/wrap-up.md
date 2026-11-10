---
description: End a work session. Update PROGRESS.md and commit so the next chat starts clean.
---
1. Rewrite `docs/PROGRESS.md`. Replace its contents; don't append. Keep it under 40 lines, using its
   existing headings: Current state, Done this session, Next up, Open questions, Known issues.
2. If a significant technical decision was made, add an ADR in `docs/decisions/` (next number).
3. Add user-visible changes to `CHANGELOG.md` under "Unreleased".
4. Commit with `docs: update progress` and push the branch.
5. Reply with the 3-line "Next up" section only.
