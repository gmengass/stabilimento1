# Stabilimento1

An open-source, self-hostable booking application. MIT licensed.

> Status: pre-alpha. See [docs/PROGRESS.md](docs/PROGRESS.md) and [docs/ROADMAP.md](docs/ROADMAP.md).

## Repository map
| Path | Purpose |
|------|---------|
| `CLAUDE.md` | Rules Claude follows in every session |
| `.claude/agents/` | Specialist agents: planner, tester, debugger, reviewer, security |
| `.claude/commands/` | Slash commands: `/start`, `/feature`, `/wrap-up`, `/checkpoint` |
| `.claude/settings.json` | Blocks destructive git commands for Claude |
| `docs/PROJECT_BRIEF.md` | What we're building |
| `docs/ROADMAP.md` | Ordered work items |
| `docs/PROGRESS.md` | Current state (handoff between sessions) |
| `docs/ARCHITECTURE.md` | System map and invariants |
| `docs/decisions/` | Architecture Decision Records |
| `.github/` | CI, PR template, issue templates |

## How we work with Claude
1. Open a new chat per roadmap item. Type `/start`.
2. `/feature <name>` runs plan → tests → code → debug → review.
3. `/wrap-up` saves state to `docs/PROGRESS.md`, so the next chat doesn't need the old one.
4. `/checkpoint <label>` before anything risky.

## Reverting safely
- Every change lands through a pull request, so you can revert a PR from GitHub with one click.
- Releases are tagged `vX.Y.Z`. Restore points are tagged `checkpoint/*`.
- To look at or restore an old version without losing anything:
  `git switch -c restore-old <tag-or-commit>`
- To undo a merged change: `git revert <commit>` (creates a new commit; history is kept).

## Contributing
See [CONTRIBUTING.md](CONTRIBUTING.md).

## License
[MIT](LICENSE)
