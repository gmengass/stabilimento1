---
description: Start a work session. Load current state and propose the next task.
---
Run the `tracker` agent in `check` mode. Read `docs/PROGRESS.md` and the current milestone in
`docs/ROADMAP.md`. Run `git status` and `git log --oneline -5`.

Then reply in at most 6 lines:
- Where we are (1 line)
- The next roadmap item and its branch name
- Any open questions that block it
- Drift the tracker found between the docs and the repository, if any

Do not summarize the whole project. Wait for confirmation, or $ARGUMENTS, before starting.
