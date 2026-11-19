# 0022. Nightly backups: age, box disk + OneDrive, 14 days

- Status: Accepted (owner, 2026-11-19: "14 daily", "lose the usb", key usable on a new box)
- Date: 2026-11-19
- Amends: the "Backups: OneDrive" section of [ADR 0003](0003-hosting.md). Pre-update dumps
  ([ADR 0008](0008-deploy-details.md)) are unchanged.

## Context
ADR 0003 planned a USB copy, rclone `crypt` with a password on the box, 14/8/12 retention and
an automatic monthly restore test. The owner wants something simpler: two places, 14 days, and
a key he can use to restore on a brand-new box after the old one is lost.

## Decision
- **When**: a systemd timer on the box, every night at 03:30 Europe/Rome (outside the DST hour),
  `Persistent=true` so a night missed while the box was off runs at the next boot. The job takes
  the deploy lock (`.deploy/lock`), waiting up to `BACKUP_LOCK_WAIT` seconds (default 1800) for
  an update to finish.
- **What**: `pg_dump -Fc` of the app database, named `<UTC timestamp>_<release>.dump.age`, so
  recovery knows which release to install first.
- **Checked before it is kept**: every night the plaintext dump is restored into a scratch
  database `booking_restore_test` in the same PostgreSQL, a sanity query must find the
  migrations table, then the scratch database is dropped. A dump that doesn't restore fails the
  run.
- **Encryption: [age](https://age-encryption.org)**, not rclone `crypt` or gpg. The box only
  holds public keys (`BACKUP_AGE_RECIPIENTS`). The secret key (`AGE-SECRET-KEY-1…`) lives in
  the owner's password manager, never on the box. A stolen box, `.env` or OneDrive login can't
  read the backups. The same `.age` file goes everywhere, and a restore needs only `age` and
  the secret key, so it works on a new box.
- **Where**: `BACKUP_DIR/nightly/` on the box disk, and the OneDrive folder in
  `BACKUP_RCLONE_REMOTE` via rclone (`copyto`, then `check` against the local file). No USB.
  An empty remote is skipped with a warning; a remote that is set but fails fails the run. The
  local copy is kept either way.
- **Retention**: the newest 14 files in each place. Pruning runs only after a fully successful
  run, so a broken night never deletes a good backup. Names dated more than a day ahead are
  ignored by pruning and by `latest`, so files planted on OneDrive can't push real backups out.
  OneDrive's recycle bin and version history stay on as a second line.
- **Work files** (the plaintext dump during a run) live in an owner-only folder inside
  `BACKUP_DIR`, not `/tmp`, and are removed on every exit; the unit adds `PrivateTmp`.
- **Alert**: any failure (including the timer killing a stuck run) sends an email through
  `curl` SMTP (`BACKUP_ALERT_*`). URLs and passwords reach curl through its config, never its
  command line. The optional `BACKUP_HEARTBEAT_URL` is called after each good
  run, so an outside monitor notices when runs stop altogether (box off, timer disabled).
  Alerts name the step that failed, never customer data.
- **Restore**: `scripts/restore-backup.sh` asks for the secret key (not echoed, passed to age on
  a pipe, never written to a file) and always restores into the scratch database first.
  `--test` prints counts and drops it. Without `--test`, after typing `yes`, the app is stopped
  and the checked scratch database is **renamed** into place; the replaced one is kept as
  `booking_before_restore` until the next restore. A backup that doesn't restore never touches
  the app database. `latest` takes the newest file on the box, or on OneDrive when the box has
  none (new box).
- **Monthly**: the owner runs `scripts/restore-backup.sh --test latest` with the real key. This
  replaces ADR 0003's automatic monthly test, which the box can't do without the secret key.

## Consequences
- Losing the secret key makes every backup unreadable: it is kept in the password manager and
  on one printed or offline copy. It is made on the owner's PC, not the box.
- Each restore (and the monthly test) briefly gives the key to the box: a compromised box at
  that moment could read every backup.
- age proves who can read a backup, not who wrote it: anyone with the OneDrive login could
  upload a crafted dump. A restore shows the file name and date and asks for `yes`.
- The alert email depends on SMTP sending, which Microsoft 365 is phasing out for basic
  passwords; the heartbeat is the alert that doesn't.
- 14 days of backups keep erased customers for up to 14 days (GDPR open question).
- OneDrive needs rclone authorised once against the club's Microsoft 365 (the owner is admin).
