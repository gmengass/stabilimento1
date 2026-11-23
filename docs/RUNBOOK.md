# Runbook: the club server

How to set up, update, roll back and recover the server.
- Why it works this way: [ADR 0003](decisions/0003-hosting.md),
  [ADR 0008](decisions/0008-deploy-details.md) and [ADR 0022](decisions/0022-backups.md) (backups).

## What runs where
- **Docker Compose project `stabilimento`**:
  - `db` (PostgreSQL)
  - `migrate` (one-shot job)
  - `app` (Next.js, no host port)
  - `caddy` (HTTPS on ports 80 and 443)
- **State that must survive a machine move**:
  - `.env`: secrets, kept in the owner's password manager too
  - the `pgdata` volume: the database
  - the `caddy_data` volume: the internal CA's root key
  - `backups/`: dumps (`pre-update/` plaintext, `nightly/` encrypted, also on OneDrive)
  - the backup secret key (`AGE-SECRET-KEY-1…`): in the password manager only, never on the box
  - `~/secrets/stabilimento-android.p12` and `.pass`: the Android app's signing key
- **Deploy state** lives in `.deploy/` in the checkout:
  - `current`: the installed release
  - `previous`: the release before it
  - `last-backup`: the pre-update dump
  - `lock`: present while a script runs
- Commands below run in the checkout (`~/stabilimento1`), inside WSL on Windows.

## A. Windows mini PC: Docker Engine in WSL2
You need Windows 11 22H2 or later for mirrored networking. Use Docker Engine, not Docker Desktop.

1. **Power and updates**
   - Windows: never sleep or hibernate.
   - BIOS: "power on after AC loss".
   - Windows Update: active hours set to the club's opening hours.
2. **WSL and Ubuntu**: in an admin PowerShell, run `wsl --install -d Ubuntu-24.04`, then reboot and
   create the Linux user.
   **Shortcut for steps 3–4 and "First install":** inside Ubuntu, run
   ```sh
   git clone https://github.com/gmengass/stabilimento1 ~/stabilimento1
   cd ~/stabilimento1 && sh scripts/setup-wsl.sh vX.Y.Z    # v0.1.1 or later
   ```
   - It enables systemd. Then run `wsl --shutdown` in PowerShell and run the script again.
   - It installs Docker Engine 28 or later.
   - It asks for the box's name and IP, writes `.env` with fresh secrets, installs the release and
     creates the first admin.
   - It exports the root certificate (also to Windows Downloads) and prints its fingerprint.
   - It makes an encrypted backup of the CA key in `~/secrets`. The key is never written to disk
     unencrypted.
   - Every step is safe to run again. Steps 5–8 below are still done in Windows.
3. **systemd**: in Ubuntu, create `/etc/wsl.conf`, then run `wsl --shutdown` from PowerShell:
   ```ini
   [boot]
   systemd=true
   ```
4. **Docker Engine 28 or later**:
   - Install it from Docker's apt repository: docs.docker.com → Engine → Install → Ubuntu.
   - Version 28 drops LAN traffic sent directly to container IPs, so nothing reaches the app
     without going through Caddy.
   - Then run `sudo usermod -aG docker $USER && sudo systemctl enable docker`.
   - Membership of the `docker` group is effectively root, and `docker inspect` shows the
     secrets. Only the owner's account belongs in it.
5. **Mirrored networking**: create `%UserProfile%\.wslconfig` on Windows, then run `wsl --shutdown`:
   ```ini
   [wsl2]
   networkingMode=mirrored
   ```
6. **Firewall**: in an admin PowerShell, allow 80 and 443 only from the staff network. Replace
   `192.168.1.0/24` with your staff subnet:
   ```powershell
   New-NetFirewallRule -DisplayName "Stabilimento HTTPS" -Direction Inbound -Protocol TCP `
     -LocalPort 80,443 -RemoteAddress 192.168.1.0/24 -Action Allow
   New-NetFirewallHyperVRule -Name StabilimentoHttps -DisplayName "Stabilimento HTTPS (WSL)" `
     -Direction Inbound -VMCreatorId '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}' `
     -Protocol TCP -LocalPorts 80,443 -RemoteAddresses 192.168.1.0/24
   ```
7. **Start at boot, with no one logged in**: create a Task Scheduler task with:
   - **Account**: the Windows account that installed Ubuntu. WSL distros belong to one user.
   - **General**: "Run whether user is logged on or not".
   - **Trigger**: At startup.
   - **Action**: `wsl.exe -d Ubuntu-24.04 --exec /bin/sh -c "exec sleep infinity"`. The running
     `wsl.exe` keeps WSL from shutting down when idle, and systemd starts Docker.
   - **Settings**: untick "Stop the task if it runs longer than".
8. **Check**: reboot and don't log in. From a staff tablet, open `https://<SITE_ADDRESS>/health`.

## B. Native Linux (Ubuntu Server / Debian)
- Install Docker Engine 28 or later from Docker's apt repository, then run
  `sudo systemctl enable docker`.
- **Firewall**: Docker-published ports bypass `ufw`. Allow only the staff subnet in the
  `DOCKER-USER` chain. Replace `eth0` and the subnet with yours:
  ```sh
  sudo iptables -I DOCKER-USER -i eth0 ! -s 192.168.1.0/24 -p tcp -m multiport --dports 80,443 -j DROP
  sudo apt install iptables-persistent && sudo netfilter-persistent save
  ```
  The stack publishes IPv4 only, so no `ip6tables` rule is needed.
- Everything below is the same on both systems.

## Network checks
Do these once, and again after any router change.
- The guest Wi-Fi is a different network (SSID and subnet) from the staff Wi-Fi.
  `https://<box>/health` must be unreachable from a guest-Wi-Fi phone.
- The router has no port forwarding to the box, and UPnP is off (ADR 0003: nothing is public).

## First install
1. Clone the repo on the Linux filesystem, not `/mnt/c`:
   `git clone https://github.com/gmengass/stabilimento1 ~/stabilimento1`.
2. Run `cp .env.example .env && chmod 600 .env` and set:
   - `POSTGRES_PASSWORD` and `AUTH_SECRET`: use `openssl rand -hex 24` and `openssl rand -hex 32`
   - `APP_URL=https://stabilimento.local`
   - `SITE_ADDRESS=stabilimento.local, 192.168.1.10`
   - `TRUSTED_ORIGINS=https://192.168.1.10`: exact https origins only, no `*` and no trailing `/`
   - `DEFAULT_SNI=192.168.1.10`: the box's IP, so `https://192.168.1.10` gets a certificate
   - `BACKUP_DIR` stays on the box's own disk (default `./backups`): pre-update dumps there are
     not encrypted and contain customer data.
3. Run `scripts/update.sh vX.Y.Z`, using the latest release tag. This is the first install, so it
   takes no backup.
4. Create the first admin:
   - Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` in `.env`.
   - Run `APP_VERSION=$(cat .deploy/current) docker compose run --rm seed-admin`.
   - Remove `ADMIN_PASSWORD` from `.env`.
5. Set up the nightly backups: see [Backups](#backups).
6. Give the box a fixed IP: a DHCP reservation on the router. Add a router DNS entry for
   `stabilimento.local` if possible, because Android doesn't reliably resolve `.local` names.

## Android app for club tablets
Android devices use the app instead of a browser (ADR 0010): Chrome on Android won't open the box
even with the root installed. The app carries the club's root, so nothing is installed on the
device. It works on Android 7.0 and later, on tablets and phones.

**Build it on the box** (needs internet; the first build downloads the Android SDK and takes a
while): `scripts/build-android.sh`.
- It reads `APP_URL`, `TRUSTED_ORIGINS` and the optional `REMOTE_URL` (Tailscale, ADR 0011)
  from `.env`, and the root from `caddy_data`. Bad values are refused before anything is built.
- The APK lands in `~/stabilimento-android/`. The script prints three SHA-256 values: the club
  root, the signer, and the APK file.
- On the first build, write the root and signer fingerprints into the password manager next to
  `.env`. The root must match the one browser devices check (next section). The signer must be
  the same on every later build: a different one means a different key.
- The first build creates the signing key in `~/secrets` (`stabilimento-android.p12` and
  `.pass`, mode 600). Back both up encrypted, off the box, like `caddy_data` (Recovery):
  ```sh
  export GPG_TTY=$(tty)  # gpg asks for the passphrase here; without it: "Inappropriate ioctl"
  tar czf - -C ~/secrets stabilimento-android.p12 stabilimento-android.pass |
    gpg --symmetric --output ~/secrets/stabilimento-android-key.tgz.gpg
  gpg -d ~/secrets/stabilimento-android-key.tgz.gpg | tar tzf -  # lists both files
  ```
  Then copy `~/secrets/stabilimento-android-key.tgz.gpg` off the box. Without the key, a new APK
  won't install over the old one: every tablet has to uninstall the app (and sign in again) first.

**Install on each device:**
1. Copy the APK by USB cable or stick. Don't send it through a chat app or email. With the stick
   back in the box, check `sha256sum` of the file on it against the APK SHA-256 the script printed.
2. Open it from the file manager. Android asks to allow "Install unknown apps" for the file
   manager: allow it, install, then turn it off again. Once the app is installed, Android only
   accepts updates signed with the same key, so a swapped APK fails to install over it.
3. Open the app: it shows the sign-in page. If it shows "Server not reachable", check the device is
   on the staff Wi-Fi and that `APP_URL` opens from the box.
4. If the device had the root installed system-wide (next section), remove it: Settings →
   Security → Encryption & credentials → Trusted credentials → User tab → the root → Remove.

**Lock shared tablets to the app** (screen pinning, once per tablet):
1. Settings → Security → App pinning (or Screen pinning): on, with "Ask for PIN before unpinning".
   Use a PIN only the owner and managers know, not one every staff member uses.
2. Open the app, open Recents, tap the app icon above its window → Pin.
3. To unpin: with buttons, hold Back and Recents (or Back and Home); with gesture navigation,
   swipe up and hold. Then enter the PIN.

**Shared tablet account** (ADR 0025): everyone who uses the tablets knows its password.
- When someone leaves, reset the tablet account's password on the staff page. That logs every
  tablet out; sign each one in again with the new password. Disabling the person who left is not
  enough: with the old password they could sign in from their own phone as the tablet.
- A lost or stolen tablet: reset the tablet account's password the same way, at once.

**Rebuild and install over the old app** after a new box or a new `caddy_data` (new root), a
change to `APP_URL`, `TRUSTED_ORIGINS` or `REMOTE_URL`, or a change under `android/`. App releases
(`update.sh`) need no new APK. Keep the same signing key, and sign-ins and settings stay.

## Trusting the certificate on staff devices
Android devices use the app instead (previous section). This is for iPhones, iPads and computers.
Do this once per device.
- Install the root only on **club-owned** tablets and phones where possible. A trusted root can
  vouch for any website, so whoever holds its key (the `caddy_data` volume) could intercept that
  device's HTTPS traffic.
- On staff personal phones, use it only with the owner's agreement, and remove it when they leave.
1. Export the root certificate (public, not the key) outside the checkout:
   `docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ~/stabilimento-root.crt`.
2. Send it to each device, for example by AirDrop or a USB stick.
   - Before trusting it, compare its SHA-256 fingerprint on the device (certificate details) with
     the one shown by `openssl x509 -noout -fingerprint -sha256 -in ~/stabilimento-root.crt`.
     A swapped file would let someone intercept the tablet's traffic.
3. Install it:
   - **iOS / iPadOS**: open the file and install the profile. Then go to Settings → General →
     About → Certificate Trust Settings and turn on full trust.
   - **Android**: Settings → Security → Encryption & credentials → Install a certificate → CA
     certificate. Chrome then trusts it. Firefox also needs "Use third party CA certificates" turned
     on under Settings → About Firefox, tapped 5×, then Secret settings.
4. **Check client IPs**: in `docker compose logs caddy | grep remote_ip`, different tablets must show
   different addresses.
   - If every request shows the same address, WSL networking is hiding the source IP.
   - Then all staff share one sign-in rate limit. Note it in PROGRESS "Open questions".

## Update
`scripts/update.sh vX.Y.Z` runs these steps:
1. lock
2. refuse on local changes
3. pre-update dump
4. checkout the tag
5. build
6. stop the app
7. migrate
8. start
9. health check

Expect a short outage: Caddy shows an error page while the app is stopped. If a step fails, the
script stops with the app down and prints the rollback command.

## Rollback
`scripts/rollback.sh` returns to the previous release and restores the pre-update dump.
- It also works after a failed update. Until you run it, `update.sh` refuses to start again, so
  the good dump can't be replaced.
- The last 3 pre-update dumps are kept, readable by the owner only.
- **Everything entered since the update is lost.** The script shows the dump time and asks you to
  type `yes`.
- Use it right after a bad update. If staff have already entered real bookings since then, export
  or write them down first.

## Backups
Every night at 03:30 (Italian time) `scripts/backup.sh` dumps the database, checks the dump
restores, encrypts it with age, keeps it in `backups/nightly/` and copies it to OneDrive. The
newest 14 are kept in each place. Any failure emails you. See [ADR 0022](decisions/0022-backups.md).

### One-time setup
1. **Install the tools and the timer**: `scripts/install-backup-timer.sh` (asks for your sudo
   password; installs `age` and `rclone`).
2. **Make the key on your own PC, not the box.** In PowerShell:
   ```powershell
   winget install FiloSottile.age
   age-keygen
   ```
   - It prints a `# public key: age1…` line and an `AGE-SECRET-KEY-1…` line. Don't save them to a
     file.
   - Save the **secret** line in the password manager as "Stabilimento backup key". Also print it,
     or write it down, and keep it with the club papers. **Without it no backup can be read.**
   - Put the **public** key in `.env` on the box: `BACKUP_AGE_RECIPIENTS=age1…`.
   - Close the PowerShell window.
3. **OneDrive** (you are the Microsoft 365 admin):
   - Make a folder for the backups, e.g. `stabilimento-backups`, in the OneDrive account that
     will hold them.
   - On the box run `rclone config`: `n` (new remote), name `onedrive`, storage `onedrive`, leave
     client id and secret empty, region `global`, "Use web browser to automatically
     authenticate?" → `n`.
   - It prints an `rclone authorize "onedrive" …` command. Run it on a Windows PC with rclone
     (`winget install Rclone.Rclone`), sign in with the club's Microsoft 365 account, accept the
     consent screen (as admin you can approve it for the organisation in Entra ID →
     Enterprise applications if the tenant asks for approval), and paste the token back on the
     box. Choose `onedrive` → "OneDrive Personal or Business".
   - Check: `rclone lsd onedrive:`. Then set `BACKUP_RCLONE_REMOTE=onedrive:stabilimento-backups`.
   - `rclone config` stores the token in `~/.config/rclone/rclone.conf` (owner-only). It can read
     and delete the whole OneDrive: don't copy it anywhere; on a new box, authorise again.
   - In OneDrive, keep the recycle bin and version history on: they undo a deleted or replaced
     backup.
4. **Alert email**: in Microsoft 365, use (or create) a mailbox for the box, e.g.
   `stabilimento@club…`. In the admin centre → Users → that user → Mail → "Manage email apps",
   turn on **Authenticated SMTP**. It must also be allowed for the tenant (Exchange admin centre
   → Settings → Mail flow), and Security Defaults block it.
   - Microsoft is phasing out SMTP with a plain password. If the test in step 6 doesn't arrive,
     use another SMTP sender instead (your mail provider's, or a service such as Brevo or
     SMTP2GO) with the same four lines.
   - Then in `.env`:
   ```
   BACKUP_ALERT_SMTP_URL=smtp://smtp.office365.com:587
   BACKUP_ALERT_SMTP_USER=stabilimento@club…:<password>
   BACKUP_ALERT_FROM=stabilimento@club…
   BACKUP_ALERT_TO=you@club…
   ```
5. **Heartbeat (do this one)**: a free check on healthchecks.io, "daily, grace 2 hours". Put its
   ping URL in `BACKUP_HEARTBEAT_URL`. It emails you if a good backup doesn't arrive for any
   reason (box off, timer stopped, run failed, alert email broken).
6. **Try it**: `sudo systemctl start stabilimento-backup`, then
   `journalctl -u stabilimento-backup -n 50` must end with `nightly backup OK`. Check the file is
   in `backups/nightly/` and in the OneDrive folder. To test the alert, set a wrong
   `BACKUP_RCLONE_REMOTE`, run it again, check the email arrives, then put it back.

### Every month: restore test
Run `scripts/restore-backup.sh --test latest` and paste the secret key from the password
manager. It restores the newest backup into a throwaway database, prints how many bookings it
has and the newest one, then deletes it. It must end with `restore test OK`. Put a monthly
reminder in your calendar.

### Day to day
- Status: `systemctl list-timers stabilimento-backup.timer` (next run),
  `journalctl -u stabilimento-backup -n 50` (last run).
- A run waits up to 30 minutes for an update that is running, then fails and emails you.
- "OneDrive copy skipped" every night means `BACKUP_RCLONE_REMOTE` is empty.

## Recovery on a new machine
1. Set up the machine as in section A or B, then clone the repo.
2. Copy `.env` from the password manager.
3. Restore the CA, so devices keep trusting the certificate.
   - The archive contains the CA **private key**. Keep it out of the checkout and readable by the
     owner only. Store it encrypted next to `.env` (for example `gpg -c`), then delete the
     plaintext copy.
   - On the old box, right after the first install (`setup-wsl.sh` does this) and again whenever
     the box is replaced. The archive is streamed straight into gpg, so the key never lands on
     disk unencrypted:
     ```sh
     install -d -m 700 ~/secrets
     export GPG_TTY=$(tty)
     docker run --rm -v stabilimento_caddy_data:/d:ro caddy:2.10-alpine tar czf - -C /d . |
       gpg --symmetric --output ~/secrets/caddy_data.tgz.gpg
     ```
   - On the new box, before the first install:
     ```sh
     docker volume create stabilimento_caddy_data
     export GPG_TTY=$(tty)
     gpg -d caddy_data.tgz.gpg |
       docker run --rm -i -v stabilimento_caddy_data:/d caddy:2.10-alpine tar xzf - -C /d
     ```
   - Without it, every device has to trust the new root, and the Android app needs rebuilding.
   - Restore the Android signing key too: `install -d -m 700 ~/secrets`,
     `export GPG_TTY=$(tty)` and `gpg -d stabilimento-android-key.tgz.gpg | tar xzf - -C ~/secrets`.
     Without it, tablets must uninstall the app before a new APK installs.
4. Install the release that made the backup: the part after `_` in its name, e.g.
   `20261119T023000Z_v0.13.0.dump.age` → `scripts/update.sh v0.13.0`. To see the names:
   `rclone lsf onedrive:stabilimento-backups` (after `rclone config`, see [Backups](#backups)).
5. Set up the backups again ([Backups](#backups) steps 1, 3: the same key and the same OneDrive
   folder), then restore the newest backup. It downloads it from OneDrive, asks for the secret
   key and for `yes`, and replaces the empty database:
   ```sh
   scripts/restore-backup.sh latest
   ```
   - Or a given file: `scripts/restore-backup.sh backups/nightly/<file>.dump.age`.
   - It restores into a scratch database first. Only if that works does it stop the app and
     swap it in. The replaced database stays as `booking_before_restore`; when all is well:
     `docker compose exec db dropdb -U booking booking_before_restore`.
   - Check the file name and date it shows before typing `yes`.

## Troubleshooting
- **"another deploy or backup is running"**: make sure no script is running, then
  `rmdir .deploy/lock`.
- **Unreachable from tablets but `curl -k https://localhost/health` works in WSL**: check the
  mirrored networking setting and both firewall rules, then `wsl --shutdown` and restart the task.
- **`https://<box IP>` fails with "tlsv1 alert internal error"** (curl) or "can't provide a
  secure connection" (browser), while the name works: `.env` lacks `DEFAULT_SNI=<box IP>`.
  Add it, then restart Caddy alone (it reads `.env` only at start):
  `APP_VERSION=$(cat .deploy/current) docker compose up -d --no-deps caddy`. Check with
  `curl --cacert ~/stabilimento-root.crt https://<box IP>/health`.
- **Maps don't update by themselves** (or show "Not live, reconnecting"): sign in in a browser,
  copy the session cookie, and run `curl -kN -b '<cookie>' https://localhost/api/live`. It
  should print `: connected` at once, `: ping` every 25 s, and `event: changed` within a
  second of any booking. 401 means the cookie is wrong; nothing at all means something buffers
  the stream (check `deploy/Caddyfile` still skips `encode` for `/api/live`).
- **"Too many wrong passwords for this username"**: 10 wrong passwords for one username from one
  device within 15 minutes lock it on that device for 15 minutes (100 from all devices lock it
  everywhere), even with the right password. The staff page shows the lock; an admin can lift it
  with "Unlock sign-in" or by resetting the password. Locked out of every admin account:
  `docker compose exec db psql -U booking -c "delete from login_failure"`. Many locks you can't
  explain mean someone is guessing: `docker compose logs app | grep "sign-in locked"`.
- **"Too many actions" or "Too many searches"**: one tablet or account went over 60 booking actions
  or 30 searches in a minute (or 400 searches in a day). It clears by itself. If every tablet sees
  it at once, the app sees one address for all of them: check client IPs (Android app section).
- **Logs**: `docker compose logs --tail 200 app caddy db`.
