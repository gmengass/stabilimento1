# Plan: Deploy (Compose + Caddy, update/rollback, RUNBOOK)

**Goal**: The app runs behind Caddy over HTTPS on the club box. POSIX scripts install a tagged
release and can roll it back. A RUNBOOK covers WSL2 and native Linux (ADR 0003).

## Acceptance criteria
- **HTTPS health check**
  - Given: the full stack is up.
  - When: a LAN device opens `https://<SITE_ADDRESS>/health`.
  - Then: it gets `{"status":"ok","db":"ok"}`, served with a certificate from Caddy's internal CA.
  - Port 3000 is closed on the host.
- **Rate limit ignores spoofed IP headers**
  - Given: 5 failed sign-ins from one client.
  - When: a 6th arrives with a different client-set `X-Forwarded-For` or `X-Real-IP` header.
  - Then: it gets 429. Caddy overwrites the IP header and the app trusts only that header.
- **Trusted origins**
  - Given: an origin listed in `TRUSTED_ORIGINS` (e.g. the box's IP).
  - When: staff sign in from it.
  - Then: the origin check passes. Other origins are rejected.
- **Update**
  - Given: `vA` is running.
  - When: `scripts/update.sh vB` runs.
  - Then, in this order: lock → preflight → backup hook → checkout → build `:vB` → stop app →
    migrate → start → health check → write state.
  - Any failure stops the script with a non-zero exit and prints the rollback command.
- **Rollback**
  - When: `scripts/rollback.sh` runs and the operator confirms.
  - Then: the DB is dropped, re-created and restored from `vB`'s pre-update dump, and `vA` runs
    from its existing image (no rebuild).
- **First install**: with no deploy state, `update.sh` acts as a first install. It skips the
  backup, and rollback refuses to run.
- **Refusals before any change**: a bad tag (not `^v[0-9]+\.[0-9]+\.[0-9]+$`), a dirty worktree
  or a missing `.env`.
- **Portability**: the scripts pass `shellcheck -s sh` and run under `dash`.

## Decisions (ADR 0008)
- **TLS**: Caddy `tls internal` for `stabilimento.local` and the box's static IP.
  - Staff trust the root CA once per device.
  - Tailscale certs are an optional extra site block later.
  - The `caddy_data` volume (root key) must survive a machine move.
- **Client IP**: Caddy overwrites `X-Real-IP` with the peer address. Better Auth reads only that
  header.
- **Images**: built on the box from the checked-out tag, tagged `:vX.Y.Z`, last 3 kept, no
  registry. Rollback reuses the old image.
- **Rollback**: restores the pre-update dump into a re-created DB. Data entered after the update
  is lost, so the script shows the dump time and asks for confirmation.

## Risks
- **Spoofed IP header**: covered by tests and a CI check.
- **WSL2 mirrored networking may hide LAN source IPs**: all staff would then share one rate-limit
  bucket. The RUNBOOK checks Caddy's access log.
- **`.local` is unreliable on Android (mDNS)**: put a router DNS entry and the IP in the cert and
  in `TRUSTED_ORIGINS`.
- **`pg_restore --clean` leaves tables from newer migrations**: drop and re-create the DB instead.
- **Concurrent runs**: a lock, shared with the future nightly backup.
- **Old code against a new schema**: the app is stopped during migrations.
- **Repo location in WSL**: keep it on ext4 (`~/`), not `/mnt/c`.
- **Firewall on native Linux**: Docker-published ports bypass ufw.

## Steps (one commit each)
1. `docs:` ADR 0008, and links to it from 0003 and 0007.
2. `feat(auth):` `X-Real-IP` header and `TRUSTED_ORIGINS`, tests first.
3. `feat(deploy):` Caddy service and Caddyfile, app port removed, `.env.example`, CI docker job
   switched to Caddy.
4. `feat(deploy):` `scripts/lib/common.sh` and `scripts/pre-update-backup.sh`, shellcheck in CI.
5. `feat(deploy):` `update.sh` and `rollback.sh`, tested with stubs on `PATH`.
6. `ci:` end-to-end install → update → rollback with local `v0.0.x` tags.
7. `docs:` RUNBOOK.
8. `docs:` ARCHITECTURE, CLAUDE.md, PROGRESS.

## Open questions
- Does WSL2 mirrored networking preserve LAN source IPs? Verify on the box.
- Keep-data rollback (`migrate down` with the newer image) as an option?
- Move the db host port to a dev-only override file?
- Roll back automatically on a failed health check? For now the script only prints the rollback
  command.
