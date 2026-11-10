---
description: Run the full loop for one roadmap item. Usage: /feature <short-name or description>
---
Feature: $ARGUMENTS

1. Create the branch `feat/<short-name>` from an up-to-date `main`.
2. Use the **planner** agent to make the plan. Show it to me and wait for approval.
3. Use the **tester** agent to write failing tests for the acceptance criteria.
4. Implement in small Conventional Commits.
5. Run all tests and lint. On failure, use the **debugger** agent.
6. Use the **reviewer** agent (and **security** if relevant). Fix CHANGES NEEDED items.
7. Tick the item in `docs/ROADMAP.md`, then run `/wrap-up`.

Report only at steps 2, 6 and 7. Keep each report short.
