# 0003. Hosting: local server on the club network

- Status: Accepted (on merge of this PR)
- Date: 2026-11-10

## Context
- One beach club, possibly with more booking areas later.
- Only staff make bookings, on site. 5–10 staff users in total, several at once.
- No public website or customer accounts are needed.
- The owner wants low running costs, easy recovery from mistakes, and an open-source, self-hostable app.
- Personal data (customer names, phone numbers) is covered by GDPR.
- The owner already has a company OneDrive (Microsoft 365) account.

## Decision
### Server
- One always-on **mini PC with an SSD**, kept indoors and ventilated, on a small **UPS**.
  A Raspberry Pi 5 *with an SSD* is acceptable. Avoid SD-card-only setups for the database.
- Runs **Docker Compose**: app + PostgreSQL + Caddy (reverse proxy for HTTPS).
- Staff use a browser on phones/tablets at a fixed local address (e.g. `https://stabilimento.local`).

### Server OS (amended 2026-11-11)
- **Now: Windows mini PC with Docker Engine inside WSL2**, not Docker Desktop. Docker Desktop only
  starts after a user logs in, so a power cut or Windows Update reboot would leave the app down
  until someone signs in.
  - WSL2 distro (Ubuntu LTS) with `systemd=true` in `/etc/wsl.conf` and the `docker` service enabled.
  - A Task Scheduler job runs at startup, "whether user is logged on or not", and keeps WSL running
    (no idle shutdown). Compose `restart: unless-stopped` brings the stack back.
  - `networkingMode=mirrored` in `.wslconfig` (Windows 11 22H2+), so staff devices on the LAN reach
    ports 80/443 directly. Windows Firewall allows only those ports, from the staff network.
- **Later: native Linux (Ubuntu Server / Debian) on the same or another box** is a supported target.
  The stack, scripts and RUNBOOK stay OS-neutral (plain Docker Engine + Compose, POSIX shell), so
  moving is: install Docker, copy `.env`, restore the latest backup. Only the WSL2 boot/networking
  section of the RUNBOOK is Windows-specific.

### Network
- The app is reachable only on a **dedicated staff Wi-Fi network**, separate from any guest Wi-Fi.
- Nothing is exposed to the public internet. No router port-forwarding.
- Everyone logs in with their own account, even on the staff network.

### Remote access (optional): Tailscale
- The server joins a private Tailscale network, so the owner (and chosen staff) can reach the app
  from anywhere on their own devices, with no ports opened.
- Tailscale also provides valid HTTPS certificates for the server's Tailscale name.

### Backups: OneDrive
- Every night the server makes a **database dump** (`pg_dump`). It keeps a local copy on a USB drive
  and uploads an **encrypted** copy to a dedicated folder on the company OneDrive using
  `rclone` (OneDrive remote + `crypt` layer). OneDrive only ever sees encrypted files.
- Retention: 14 daily, 8 weekly, 12 monthly.
- Before every app update, a backup is taken automatically (restore point for the data).
- **Monthly restore test**: a script restores the latest backup into a throwaway database and
  checks it. Backups that are never tested are not backups.
- The encryption password is stored in the owner's password manager. Without it, the backups
  cannot be read.
- The backup job sends an alert (e.g. email) if a run fails.

### Updates
- Code changes still go through reviewed PRs on GitHub (see CLAUDE.md).
- On the server, `scripts/update.sh` does: backup → pull the tagged release → apply migrations →
  restart. `scripts/rollback.sh` returns to the previous release plus its pre-update backup.
- Only tagged releases (`vX.Y.Z`) are installed, never the tip of an unreleased branch.

### Testing changes
- There are no cloud preview environments. Changes are tried on a laptop or a second Docker stack
  with seed data. Real customer data never leaves the server and its backups.

### Live updates
- Staff screens refresh changes within a few seconds (Server-Sent Events). No message broker.
- The database rejects overlapping bookings (exclusion constraint).

## Alternatives considered
- **Managed cloud (Render / Vercel + Neon)**: about $15–25/month, with remote access and previews
  built in. Not needed for staff-only, on-site use. Still possible later with no code changes,
  thanks to Docker.

## Consequences
- Running cost: about £0/month after the one-off hardware (mini PC, UPS, USB drive). Tailscale's
  free personal plan or a low-cost business plan, depending on Tailscale's terms for company use;
  check at setup. The OneDrive storage is already paid for.
- It works during internet outages. Only Tailscale access and offsite backup uploads pause.
- The owner is responsible for the box being powered on. A failure is recovered by restoring the
  latest backup onto any machine with Docker (documented in `docs/RUNBOOK.md`, written at the
  Deploy item).
- Confirm with whoever manages the company Microsoft 365 that storing encrypted backups containing
  customer data there is allowed.
- HTTPS on plain Wi-Fi: Caddy's internal certificate, trusted once per staff device
  ([ADR 0008](0008-deploy-details.md)).
