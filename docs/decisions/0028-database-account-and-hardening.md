# 0028. The app's own database account, container hardening and pinned dependencies

- Status: Accepted (owner, 2026-11-23: "lets do batch 2")
- Date: 2026-11-23
- Amends: [ADR 0008](0008-deploy-details.md) (compose services, `.env`),
  [ADR 0010](0010-android-app.md) (the APK trusts the club root only)

## Context
The 2026-11-23 security re-audit ([plan](../plans/security-fixes.md), Batch 2):
- The app connected to Postgres as `POSTGRES_USER`, which the image makes a superuser. An SQL
  injection or a leaked `DATABASE_URL` meant the whole database, and programs on its container
  (`COPY ... TO PROGRAM`).
- Containers ran with Docker's default capabilities; images and CI actions followed moving tags.
- The APK trusted every system root as well as the club root, so any public CA could vouch for
  the Tailscale name.
- `update.sh` installed any tag that reached GitHub.

## Decision
- **App account `<db>_app`** (`src/db/app-role.ts`): not a superuser, no `CREATEROLE`,
  `CREATEDB` or replication. It may read and write the tables and sequences of `public`; it may
  read but not change the migration tables; it may add to `audit_log` and mark entries undone,
  never rewrite or delete them. No temp tables; only it and the owner may connect to the database.
  - `APP_DATABASE_URL` is the app's connection string. `migrate up` creates or updates the account
    after migrating and sets its password (sent as a SCRAM verifier, never in clear SQL); a bad
    or placeholder password is refused before migrating. `migrate grant` re-grants after a
    backup is restored, and restores create the (empty) role first so a dump's grants apply.
  - Grants run on every migration, not in one migration, so they follow new tables and restored
    databases. Migrations, `seed-admin` and backups keep using `POSTGRES_USER`.
  - `update.sh` adds `APP_DATABASE_URL` with a random password to a box's `.env`. Without it,
    compose gives the app the owner URL, so the first update (run by the older `update.sh`) can't
    fail on a missing setting; the box switches at its next update.
- **Containers**: `no-new-privileges` everywhere; `cap_drop: ALL` for the Node containers and
  Caddy (which keeps `NET_BIND_SERVICE`); the app's file system is read-only, with small tmpfs
  mounts for `/tmp`, Next's cache and its route cache (all e2e specs pass on such a build). Postgres keeps its capabilities (its entrypoint switches user) and its loopback
  port, which `npm run dev` uses.
- **Pinning**: base images by digest (tag kept for reading), CI actions by commit. Dependabot
  opens monthly PRs for actions, images and Gradle; they run the full CI like any change. A unit
  test keeps the copies Dependabot can't see (scripts, CI services) identical. npm packages stay
  with `npm audit` in CI and GitHub's security alerts.
- **APK**: trusts `@raw/club_root` only. It opens nothing but `APP_URL` and `REMOTE_URL`, both
  signed by Caddy (ADR 0011).
- **Signed tags, opt-in**: with `.deploy/allowed_signers`, `update.sh` installs only tags signed
  by those SSH keys (GPG signatures are not accepted), whose signed name matches the tag, and
  checks out the verified commit. `update.sh` never installs an older release than the current.

## Alternatives considered
- **The role and grants in a migration**: a restored backup or a new table would lose them, and
  `down` would have to drop a role the running app uses.
- **Encrypting the pre-update dumps**: a rollback would need the secret key, which ADR 0022 keeps
  off the box. Device encryption (BitLocker) protects them at rest instead.
- **Pinning the Tailscale name to Let's Encrypt roots**: Caddy signs that name itself, so the
  club root alone is both stricter and simpler.
- **Gradle dependency verification** (`verification-metadata.xml`): needs a networked Gradle run
  to generate, which sessions can't do; the signing key is already kept out of the networked
  build step. Left for a CI job later.

## Consequences
- A box gets the new account on its next `update.sh`; a rollback to an older release goes back to
  the owner account, since its compose file uses it.
- A Dependabot PR is needed to move to a new image; nothing changes under the box silently.
- If the club root changes (new `caddy_data`), the APK must be rebuilt, as before (ADR 0010).
