# Runbook: the club server

How to set up, update, roll back and recover the server.
- Why it works this way: [ADR 0003](decisions/0003-hosting.md) and
  [ADR 0008](decisions/0008-deploy-details.md).
- Nightly backups are a later roadmap item. Until then, the only restore point is the pre-update
  dump that `update.sh` takes.

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
  - `backups/`: dumps
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
   - `BACKUP_DIR` stays on the box's own disk (default `./backups`). Don't use an unencrypted USB
     stick: dumps contain customer data, and the Backups item adds encryption.
3. Run `scripts/update.sh vX.Y.Z`, using the latest release tag. This is the first install, so it
   takes no backup.
4. Create the first admin:
   - Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` in `.env`.
   - Run `APP_VERSION=$(cat .deploy/current) docker compose run --rm seed-admin`.
   - Remove `ADMIN_PASSWORD` from `.env`.
5. Give the box a fixed IP: a DHCP reservation on the router. Add a router DNS entry for
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
  tar czf - -C ~/secrets stabilimento-android.p12 stabilimento-android.pass |
    gpg --symmetric --output ~/secrets/stabilimento-android-key.tgz.gpg
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
     docker run --rm -v stabilimento_caddy_data:/d:ro caddy:2.10-alpine tar czf - -C /d . |
       gpg --symmetric --output ~/secrets/caddy_data.tgz.gpg
     ```
   - On the new box, before the first install:
     ```sh
     docker volume create stabilimento_caddy_data
     gpg -d caddy_data.tgz.gpg |
       docker run --rm -i -v stabilimento_caddy_data:/d caddy:2.10-alpine tar xzf - -C /d
     ```
   - Without it, every device has to trust the new root, and the Android app needs rebuilding.
   - Restore the Android signing key too: `install -d -m 700 ~/secrets` and
     `gpg -d stabilimento-android-key.tgz.gpg | tar xzf - -C ~/secrets`. Without it, tablets must
     uninstall the app before a new APK installs.
4. Install the release that made the dump: `scripts/update.sh vX.Y.Z`.
5. Restore the latest dump:
   ```sh
   docker compose stop app
   docker compose exec -T db sh -c 'dropdb -U "$POSTGRES_USER" --force "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
   docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' < backups/pre-update/<file>.dump
   docker compose start app
   ```

## Troubleshooting
- **"another deploy or backup is running"**: make sure no script is running, then
  `rmdir .deploy/lock`.
- **Unreachable from tablets but `curl -k https://localhost/health` works in WSL**: check the
  mirrored networking setting and both firewall rules, then `wsl --shutdown` and restart the task.
- **`https://<box IP>` fails with "tlsv1 alert internal error"** (curl) or "can't provide a
  secure connection" (browser), while the name works: `.env` lacks `DEFAULT_SNI=<box IP>`.
  Add it, then `docker compose up -d caddy`. Check with
  `curl --cacert ~/stabilimento-root.crt https://<box IP>/health`.
- **Logs**: `docker compose logs --tail 200 app caddy db`.
