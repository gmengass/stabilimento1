# Setup guide (one-time, for the project owner)

## 1. Create the GitHub repository (your safety net and open-source home)
1. Create a free GitHub account if you don't have one.
2. New repository → name `stabilimento1` → **Public** → don't add a README or license (we have them).
3. Upload this project. Either:
   - with Git installed: `cd stabilimento1 && git remote add origin https://github.com/<you>/stabilimento1.git && git push -u origin main --tags`
   - or ask Claude in chat to attach the repo to the session and push it for you.
4. Replace `[Your Name]` in `LICENSE`.

## 2. Protect `main` (so nothing can be lost or overwritten)
Settings → Rules → Rulesets → New branch ruleset, targeting `main`:
- Require a pull request before merging
- Require status checks to pass (select "CI / checks" after the first run)
- Block force pushes
- Restrict deletions

## 3. Connect GitHub to Claude
- claude.ai → Settings → Connectors → GitHub (allow access to the `stabilimento1` repo).
- That lets Claude clone the repo, work on branches, open pull requests and read CI results.

## 4. Optional: work on your own computer
- Install the Claude desktop app and, optionally, Claude Code (the CLI), which uses `.claude/` directly.
- In the desktop app, use "Add folder" to give Claude access to your local `stabilimento1` folder.
- For running the app locally you'll want Git, Node.js 22 LTS and Docker (for PostgreSQL).

## 5. Daily rhythm
New chat → `/start` → `/feature <item>` → review the PR on GitHub → merge → `/wrap-up`.
