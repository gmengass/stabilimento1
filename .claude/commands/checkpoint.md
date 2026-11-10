---
description: Create a safe restore point before a risky change. Usage: /checkpoint <label>
---
1. Make sure the working tree is clean. If it isn't, commit the work with `chore: checkpoint before $ARGUMENTS`.
2. Create the tag `checkpoint/<YYYY-MM-DD>-<label>` and push it.
3. Reply with one line: the tag name, and how to restore it:
   `git switch -c restore-<label> checkpoint/<tag>` (safe, non-destructive).
