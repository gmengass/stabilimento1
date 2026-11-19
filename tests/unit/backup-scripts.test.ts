import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Runs scripts/backup.sh and scripts/restore-backup.sh (ADR 0022) under dash against a throwaway
// DEPLOY_ROOT. docker, rclone and curl are stubs that log their calls; age is the real binary,
// with a key generated for this test run.

const SCRIPTS = resolve(__dirname, "../../scripts");
const SMTP_URL = "smtps://smtp.example.invalid:465";
const SMTP_PASSWORD = "s3cr3t-pw";
const HEARTBEAT = "https://heartbeat.example.invalid/ping/abc";
const HEALTHY = '{"status":"ok","db":"ok"}';
const NAME = /^\d{8}T\d{6}Z_v0\.12\.0\.dump\.age$/;

// Calls are logged one per line (newlines inside `sh -c` scripts flattened).
const DOCKER_STUB = `#!/bin/sh
printf '%s' "$*" | tr '\\n' ' ' >>"$DOCKER_LOG"; echo >>"$DOCKER_LOG"
case "$*" in
  *pg_dump*) [ "\${STUB_DUMP:-}" = fail ] && exit 1; printf 'DUMPDATA' ;;
  *pg_restore*) cat >>"$RESTORE_INPUT"; [ "\${STUB_RESTORE:-}" = fail ] && exit 1 ;;
  *kysely_migration*) [ "\${STUB_SANITY:-}" = empty ] && echo 0 || echo 12 ;;
  *wget*) printf '%s' '${HEALTHY}' ;;
esac
exit 0
`;

const RCLONE_STUB = `#!/bin/sh
printf '%s\\n' "$*" >>"$RCLONE_LOG"
map() { case $1 in od:*) printf '%s/%s' "$STUB_REMOTE_ROOT" "\${1#od:}" ;; *) printf '%s' "$1" ;; esac; }
cmd=$1; shift
p1= p2= include= next=
for a in "$@"; do
  if [ -n "$next" ]; then [ "$next" = include ] && include=$a; next=; continue; fi
  case $a in
    --include) next=include ;;
    --exclude | --config | --log-file) next=skip ;;
    -*) ;;
    *) if [ -z "$p1" ]; then p1=$a; elif [ -z "$p2" ]; then p2=$a; fi ;;
  esac
done
case $cmd in
  copyto)
    [ "\${STUB_RCLONE:-}" = fail ] && exit 1
    dst=$(map "$p2"); mkdir -p "$(dirname "$dst")"; cp "$(map "$p1")" "$dst" ;;
  check)
    [ "\${STUB_RCLONE:-}" = check-fail ] && exit 1
    cmp -s "$p1/$include" "$(map "$p2")/$include" ;;
  lsf)
    [ "\${STUB_RCLONE:-}" = lsf-fail ] && exit 1
    d=$(map "$p1"); [ -d "$d" ] && find "$d" -maxdepth 1 -type f -exec basename {} \\; ; exit 0 ;;
  deletefile) [ "\${STUB_RCLONE:-}" = delete-fail ] && exit 1; rm -f "$(map "$p1")" ;;
esac
`;

// Argv goes to one log, everything the call could read (stdin, -K/-T files) to another.
const CURL_STUB = `#!/bin/sh
printf '%s\\n' "$*" >>"$CURL_ARGV"
next=
for a in "$@"; do
  if [ -n "$next" ]; then [ "$a" != - ] && [ -f "$a" ] && cat "$a" >>"$CURL_DATA"; next=; continue; fi
  case $a in -K | --config | -T | --upload-file) next=1 ;; esac
done
cat >>"$CURL_DATA"
exit 0
`;

let work: string;
let root: string;
let bin: string;
let logs: string;
let remote: string;
let scratchTmp: string;
let keys: string;
let secretKey: string;
let publicKey: string;
let otherSecret: string;
let otherPublic: string;

interface Run {
  status: number | null;
  stderr: string;
  docker: string[];
  rclone: string[];
  curlArgv: string[];
  curlData: string;
  restoreInput: string;
}

function generateKey(name: string): { secret: string; pub: string } {
  const file = join(keys, name);
  const gen = spawnSync("age-keygen", ["-o", file], { encoding: "utf8" });
  if (gen.status !== 0) throw new Error(`age-keygen: ${gen.stderr}`);
  const secret = readFileSync(file, "utf8")
    .split("\n")
    .find((line) => line.startsWith("AGE-SECRET-KEY-"));
  const pub = spawnSync("age-keygen", ["-y", file], { encoding: "utf8" }).stdout.trim();
  if (!secret || !pub.startsWith("age1")) throw new Error("could not read the generated key");
  return { secret, pub };
}

function stub(name: string, body: string): void {
  writeFileSync(join(bin, name), body);
  chmodSync(join(bin, name), 0o755);
}

function writeEnv(overrides: Record<string, string | undefined> = {}): void {
  const values: Record<string, string | undefined> = {
    POSTGRES_PASSWORD: "x",
    BACKUP_AGE_RECIPIENTS: publicKey,
    BACKUP_RCLONE_REMOTE: "od:backups",
    BACKUP_ALERT_SMTP_URL: SMTP_URL,
    BACKUP_ALERT_SMTP_USER: `alerts@example.invalid:${SMTP_PASSWORD}`,
    BACKUP_ALERT_FROM: "backup@example.invalid",
    BACKUP_ALERT_TO: "owner@example.invalid",
    BACKUP_HEARTBEAT_URL: HEARTBEAT,
    ...overrides,
  };
  const lines = Object.entries(values)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${value}`);
  writeFileSync(join(root, ".env"), `${lines.join("\n")}\n`);
}

function readLog(name: string): string {
  const file = join(logs, name);
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

const lines = (text: string) => text.split("\n").filter(Boolean);

function run(
  script: string,
  args: string[] = [],
  env: Record<string, string> = {},
  input = "",
): Run {
  for (const log of ["docker.log", "rclone.log", "curl-argv.log", "curl-data.log", "restore.in"]) {
    writeFileSync(join(logs, log), "");
  }
  // setsid: a new session has no terminal, so a prompt on /dev/tty fails instead of waiting.
  const result = spawnSync("setsid", ["-w", "dash", join(root, "scripts", script), ...args], {
    cwd: root,
    encoding: "utf8",
    input,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      DEPLOY_ROOT: root,
      TMPDIR: scratchTmp,
      BACKUP_LOCK_WAIT: "1",
      HEALTH_RETRIES: "2",
      HEALTH_DELAY: "0",
      DOCKER_LOG: join(logs, "docker.log"),
      RCLONE_LOG: join(logs, "rclone.log"),
      CURL_ARGV: join(logs, "curl-argv.log"),
      CURL_DATA: join(logs, "curl-data.log"),
      RESTORE_INPUT: join(logs, "restore.in"),
      STUB_REMOTE_ROOT: remote,
      ...env,
    },
  });
  return {
    status: result.status,
    stderr: result.stderr,
    docker: lines(readLog("docker.log")),
    rclone: lines(readLog("rclone.log")),
    curlArgv: lines(readLog("curl-argv.log")),
    curlData: readLog("curl-data.log"),
    restoreInput: readLog("restore.in"),
  };
}

const backup = (env: Record<string, string> = {}) => run("backup.sh", [], env);

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .map((entry) => join(dir, entry))
    .filter((path) => statSync(path).isFile());
}

const nightly = () => join(root, "backups", "nightly");
const remoteDir = () => join(remote, "backups");
const ageFiles = (dir: string) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((name) => name.endsWith(".dump.age"))
        .sort()
    : [];

function decrypt(file: string, keyFile = join(keys, "main")): string {
  const result = spawnSync("age", ["-d", "-i", keyFile, file], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`age -d: ${result.stderr}`);
  return result.stdout;
}

function encryptInto(dir: string, name: string, content: string): string {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, name);
  const result = spawnSync("age", ["-r", publicKey, "-o", file], { input: content });
  if (result.status !== 0) throw new Error(`age -e: ${result.stderr.toString()}`);
  return file;
}

function expectNoSecretsLeft(): void {
  const scripts = join(root, "scripts");
  const files = [...filesUnder(root), ...filesUnder(remote), ...filesUnder(scratchTmp)].filter(
    (file) => !file.startsWith(`${scripts}/`),
  );
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    expect(content, `plaintext in ${file}`).not.toContain("DUMPDATA");
    expect(content, `secret key in ${file}`).not.toContain(secretKey);
    expect(content, `secret key in ${file}`).not.toContain(otherSecret);
  }
  expect(readdirSync(scratchTmp)).toEqual([]);
}

function indexOf(calls: string[], ...fragments: string[]): number {
  const index = calls.findIndex((call) => fragments.every((f) => call.includes(f)));
  if (index < 0)
    throw new Error(`no call containing ${fragments.join(" + ")}:\n${calls.join("\n")}`);
  return index;
}

const expectInOrder = (indexes: number[]) =>
  expect(indexes).toEqual([...indexes].sort((a, b) => a - b));

const called = (calls: string[], fragment: string) => calls.some((c) => c.includes(fragment));
// URLs and passwords reach curl through -K config (stdin or a file), never argv.
const alerted = (result: Run) => result.curlData.includes(SMTP_URL);
const pinged = (result: Run) => result.curlData.includes(HEARTBEAT);

function expectAlert(result: Run, step?: RegExp): void {
  expect(result.status).not.toBe(0);
  expect(alerted(result), `no alert sent:\n${result.curlArgv.join("\n")}`).toBe(true);
  expect(pinged(result)).toBe(false);
  if (step) expect(result.curlData).toMatch(step);
}

function seed(count: number): string[] {
  const names = Array.from(
    { length: count },
    (_, i) => `20260101T0000${String(i + 1).padStart(2, "0")}Z_v0.1.0.dump.age`,
  );
  for (const dir of [nightly(), remoteDir()]) {
    mkdirSync(dir, { recursive: true });
    for (const name of names) writeFileSync(join(dir, name), "old");
    writeFileSync(join(dir, "notes.txt"), "keep me");
  }
  return names;
}

beforeAll(() => {
  keys = mkdtempSync(join(tmpdir(), "backup-keys-"));
  ({ secret: secretKey, pub: publicKey } = generateKey("main"));
  ({ secret: otherSecret, pub: otherPublic } = generateKey("other"));
});

afterAll(() => rmSync(keys, { recursive: true, force: true }));

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), "backup-test-"));
  root = join(work, "repo");
  bin = join(work, "bin");
  logs = join(work, "logs");
  remote = join(work, "remote");
  scratchTmp = join(work, "tmp");
  for (const dir of [bin, logs, remote, scratchTmp, join(root, ".deploy")]) {
    mkdirSync(dir, { recursive: true });
  }
  cpSync(SCRIPTS, join(root, "scripts"), { recursive: true });
  stub("docker", DOCKER_STUB);
  stub("rclone", RCLONE_STUB);
  stub("curl", CURL_STUB);
  writeFileSync(join(root, ".deploy", "current"), "v0.12.0\n");
  writeEnv();
});

afterEach(() => rmSync(work, { recursive: true, force: true }));

describe("backup.sh success", () => {
  it("writes one owner-only encrypted dump, copies it offsite, checks it restores, pings", () => {
    const result = backup();
    expect(result.status, result.stderr).toBe(0);
    const files = ageFiles(nightly());
    expect(files).toHaveLength(1);
    const [name = ""] = files;
    expect(name).toMatch(NAME);
    const local = join(nightly(), name);
    expect(statSync(nightly()).mode & 0o777).toBe(0o700);
    expect(statSync(local).mode & 0o777).toBe(0o600);
    expect(decrypt(local)).toBe("DUMPDATA");
    expect(readFileSync(join(remoteDir(), name))).toEqual(readFileSync(local));
    expect(indexOf(result.rclone, "copyto", name)).toBeLessThan(indexOf(result.rclone, "check"));
    expectInOrder([
      indexOf(result.docker, "pg_dump"),
      indexOf(result.docker, "pg_restore", "booking_restore_test"),
      indexOf(result.docker, "kysely_migration"),
      result.docker.findLastIndex(
        (c) => c.includes("dropdb") && c.includes("booking_restore_test"),
      ),
    ]);
    expect(result.restoreInput).toBe("DUMPDATA");
    expect(pinged(result)).toBe(true);
    expect(result.curlArgv.join("\n")).not.toContain(HEARTBEAT);
    expect(alerted(result)).toBe(false);
    expect(existsSync(join(root, ".deploy", "lock"))).toBe(false);
    expectNoSecretsLeft();
  });

  it("names the dump 'unknown' when no release is recorded", () => {
    rmSync(join(root, ".deploy", "current"));
    expect(backup().status).toBe(0);
    expect(ageFiles(nightly())[0]).toMatch(/^\d{8}T\d{6}Z_unknown\.dump\.age$/);
  });

  it("encrypts to every recipient in BACKUP_AGE_RECIPIENTS", () => {
    writeEnv({ BACKUP_AGE_RECIPIENTS: `${publicKey} ${otherPublic}` });
    expect(backup().status).toBe(0);
    const file = join(nightly(), ageFiles(nightly())[0] ?? "");
    expect(decrypt(file, join(keys, "other"))).toBe("DUMPDATA");
  });

  it("without a remote: keeps the local copy and warns that OneDrive was skipped", () => {
    writeEnv({ BACKUP_RCLONE_REMOTE: undefined });
    const result = backup();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toMatch(/skipped/i);
    expect(result.stderr).toMatch(/OneDrive/);
    expect(ageFiles(nightly())).toHaveLength(1);
    expect(result.rclone).toEqual([]);
  });
});

describe("backup.sh failures alert and keep nothing broken", () => {
  it.each([
    ["missing", undefined],
    ["empty", ""],
  ])("%s BACKUP_AGE_RECIPIENTS fails before dumping", (_, value) => {
    writeEnv({ BACKUP_AGE_RECIPIENTS: value });
    const result = backup();
    expectAlert(result);
    expect(called(result.docker, "pg_dump")).toBe(false);
  });

  it("an invalid recipient keeps no .age file and no plaintext", () => {
    writeEnv({ BACKUP_AGE_RECIPIENTS: "age1bogus" });
    expectAlert(backup());
    expect(ageFiles(nightly())).toEqual([]);
    expect(ageFiles(remoteDir())).toEqual([]);
    expectNoSecretsLeft();
  });

  it("a failed pg_dump names the dump step and leaves no files", () => {
    const result = backup({ STUB_DUMP: "fail" });
    expectAlert(result, /dump/i);
    expect(filesUnder(nightly())).toEqual([]);
    expect(filesUnder(remote)).toEqual([]);
    expectNoSecretsLeft();
  });

  it.each([
    ["the scratch restore fails", { STUB_RESTORE: "fail" }],
    ["the sanity query finds no migrations", { STUB_SANITY: "empty" }],
  ])("%s: no .age kept, scratch database dropped", (_, env) => {
    const result = backup(env);
    expectAlert(result);
    expect(ageFiles(nightly())).toEqual([]);
    expect(ageFiles(remoteDir())).toEqual([]);
    expect(indexOf(result.docker, "pg_restore", "booking_restore_test")).toBeLessThan(
      result.docker.findLastIndex(
        (c) => c.includes("dropdb") && c.includes("booking_restore_test"),
      ),
    );
    expectNoSecretsLeft();
  });

  it.each([
    ["the remote copy fails", "fail"],
    ["the remote check fails", "check-fail"],
  ])("%s: alert, local copy kept, nothing pruned anywhere", (_, mode) => {
    const seeded = seed(16);
    const result = backup({ STUB_RCLONE: mode, BACKUP_KEEP: "14" });
    expectAlert(result);
    const local = ageFiles(nightly());
    expect(local).toHaveLength(17);
    expect(local.filter((name) => NAME.test(name))).toHaveLength(1);
    expect(ageFiles(remoteDir()).filter((name) => seeded.includes(name))).toEqual(seeded);
    expect(called(result.rclone, "deletefile")).toBe(false);
  });

  it("gives up when the deploy lock stays held, leaving the other job's lock alone", () => {
    const lock = join(root, ".deploy", "lock");
    mkdirSync(lock);
    const result = backup();
    expectAlert(result);
    expect(existsSync(lock)).toBe(true);
    expect(called(result.docker, "pg_dump")).toBe(false);
  });

  it("without alert settings still fails, warns, and sends no email", () => {
    writeEnv({
      BACKUP_ALERT_SMTP_URL: undefined,
      BACKUP_ALERT_SMTP_USER: undefined,
      BACKUP_ALERT_FROM: undefined,
      BACKUP_ALERT_TO: undefined,
    });
    const result = backup({ STUB_DUMP: "fail" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/not configured/i);
    expect(result.curlArgv.filter((argv) => argv.includes("--mail-from"))).toEqual([]);
  });

  it("the alert email has the .env headers, no customer data, and no password in argv", () => {
    const result = backup({ STUB_DUMP: "fail" });
    expectAlert(result);
    const argv = result.curlArgv.find((a) => a.includes("--mail-from")) ?? "";
    expect(result.curlArgv.join("\n")).not.toContain(SMTP_URL);
    expect(argv).toContain("--mail-from");
    expect(argv).toContain("--mail-rcpt");
    expect(argv).toContain("owner@example.invalid");
    expect(result.curlArgv.join("\n")).not.toContain(SMTP_PASSWORD);
    expect(result.curlData).toContain(SMTP_PASSWORD);
    expect(result.curlData).toMatch(/^To: owner@example\.invalid/m);
    expect(result.curlData).toMatch(/^From: backup@example\.invalid/m);
    expect(result.curlData).toMatch(/^Subject:.*backup.*fail/im);
    expect(result.curlData).not.toContain("DUMPDATA");
  });
});

describe("backup.sh retention", () => {
  it("future-dated files neither count towards the 14 nor get deleted", () => {
    const names = seed(16);
    const planted = "99991231T000000Z_evil.dump.age";
    for (const dir of [nightly(), remoteDir()]) writeFileSync(join(dir, planted), "x");
    const result = backup();
    expect(result.status, result.stderr).toBe(0);
    for (const dir of [nightly(), remoteDir()]) {
      const kept = ageFiles(dir).filter((n) => n !== planted);
      expect(kept).toHaveLength(14);
      expect(kept).toEqual(expect.arrayContaining(names.slice(-13)));
      expect(ageFiles(dir)).toContain(planted);
    }
  });

  it("a failed delete on OneDrive alerts at the prune step", () => {
    seed(16);
    const result = backup({ STUB_RCLONE: "delete-fail" });
    expectAlert(result, /prune/);
  });

  it("keeps the newest BACKUP_KEEP dumps in each place and leaves other files alone", () => {
    const seeded = seed(16);
    const result = backup({ BACKUP_KEEP: "14" });
    expect(result.status, result.stderr).toBe(0);
    const [created = ""] = ageFiles(nightly()).filter((name) => NAME.test(name));
    const expected = [...seeded.slice(-13), created].sort();
    expect(ageFiles(nightly())).toEqual(expected);
    expect(ageFiles(remoteDir())).toEqual(expected);
    expect(readFileSync(join(nightly(), "notes.txt"), "utf8")).toBe("keep me");
    expect(readFileSync(join(remoteDir(), "notes.txt"), "utf8")).toBe("keep me");
  });
});

describe("restore-backup.sh", () => {
  const restore = (args: string[], key = secretKey) =>
    run("restore-backup.sh", args, {}, `${key}\n`);

  function expectClean(before: string[]): void {
    const added = filesUnder(root).filter((file) => !before.includes(file));
    expect(
      added.map((file) => relative(root, file)).filter((f) => !f.endsWith(".dump.age")),
    ).toEqual([]);
    expectNoSecretsLeft();
  }

  it("--test latest restores the newest local dump into the scratch database", () => {
    encryptInto(nightly(), "20261117T023000Z_v0.11.0.dump.age", "OLDDATA");
    encryptInto(nightly(), "20261118T023000Z_v0.12.0.dump.age", "DUMPDATA");
    const before = filesUnder(root);
    const result = restore(["--test", "latest"]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toMatch(/restore test OK/);
    expect(result.restoreInput).toBe("DUMPDATA");
    expectInOrder([
      indexOf(result.docker, "pg_restore", "booking_restore_test"),
      indexOf(result.docker, "psql"),
      result.docker.findLastIndex(
        (c) => c.includes("dropdb") && c.includes("booking_restore_test"),
      ),
    ]);
    expect(called(result.docker, "stop app")).toBe(false);
    expectClean(before);
  });

  it("a wrong key fails before creating the scratch database", () => {
    encryptInto(nightly(), "20261118T023000Z_v0.12.0.dump.age", "DUMPDATA");
    const before = filesUnder(root);
    const result = restore(["--test", "latest"], otherSecret);
    expect(result.status).not.toBe(0);
    expect(called(result.docker, "booking_restore_test")).toBe(false);
    expect(called(result.docker, "pg_restore")).toBe(false);
    expectClean(before);
  });

  it("latest on a new box downloads the newest dump from OneDrive", () => {
    encryptInto(remoteDir(), "20261117T023000Z_v0.11.0.dump.age", "OLDDATA");
    encryptInto(remoteDir(), "20261118T023000Z_v0.12.0.dump.age", "DUMPDATA");
    const before = filesUnder(root);
    const result = restore(["--test", "latest"]);
    expect(result.status, result.stderr).toBe(0);
    expect(indexOf(result.rclone, "lsf")).toBeLessThan(
      indexOf(result.rclone, "copyto", "od:backups/20261118T023000Z_v0.12.0.dump.age"),
    );
    expect(result.restoreInput).toBe("DUMPDATA");
    expectClean(before);
  });

  it("--yes <file> checks the backup in the scratch database, then swaps it in", () => {
    const file = encryptInto(nightly(), "20261118T023000Z_v0.12.0.dump.age", "DUMPDATA");
    const before = filesUnder(root);
    const result = restore(["--yes", file]);
    expect(result.status, result.stderr).toBe(0);
    expectInOrder([
      indexOf(result.docker, "pg_restore", "booking_restore_test"),
      indexOf(result.docker, "kysely_migration"),
      indexOf(result.docker, "compose stop app"),
      indexOf(result.docker, "drop database if exists booking_before_restore"),
      indexOf(
        result.docker,
        'begin; alter database \\"$POSTGRES_DB\\" rename to booking_before_restore',
      ),
      indexOf(result.docker, 'alter database booking_restore_test rename to \\"$POSTGRES_DB\\"'),
      indexOf(result.docker, "up -d --no-deps app caddy"),
      result.docker.findLastIndex((c) => c.includes("wget")),
    ]);
    expect(called(result.docker, "dropdb --force")).toBe(false);
    expect(result.restoreInput).toBe("DUMPDATA");
    expectClean(before);
  });

  it("a backup that does not restore never stops the app or touches its database", () => {
    const file = encryptInto(nightly(), "20261118T023000Z_v0.12.0.dump.age", "DUMPDATA");
    const result = run(
      "restore-backup.sh",
      ["--yes", file],
      { STUB_RESTORE: "fail" },
      `${secretKey}\n`,
    );
    expect(result.status).not.toBe(0);
    expect(called(result.docker, "stop app")).toBe(false);
    expect(called(result.docker, "alter database")).toBe(false);
    expect(
      result.docker.findLastIndex(
        (c) => c.includes("dropdb") && c.includes("booking_restore_test"),
      ),
    ).toBeGreaterThan(indexOf(result.docker, "pg_restore"));
    expectNoSecretsLeft();
  });

  it("without --yes and no one to type yes, aborts and changes nothing", () => {
    const file = encryptInto(nightly(), "20261118T023000Z_v0.12.0.dump.age", "DUMPDATA");
    const result = restore([file]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/aborted: nothing changed/);
    expect(called(result.docker, "stop app")).toBe(false);
    expect(called(result.docker, "alter database")).toBe(false);
    expectNoSecretsLeft();
  });

  it("latest ignores names dated in the future (planted files)", () => {
    encryptInto(nightly(), "20261118T023000Z_v0.12.0.dump.age", "DUMPDATA");
    encryptInto(nightly(), "99991231T000000Z_evil.dump.age", "EVILDATA");
    const result = restore(["--test", "latest"]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.restoreInput).toBe("DUMPDATA");
  });

  it("latest says so when OneDrive cannot be listed", () => {
    const result = run(
      "restore-backup.sh",
      ["--test", "latest"],
      { STUB_RCLONE: "lsf-fail" },
      `${secretKey}\n`,
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/listing OneDrive failed/);
  });

  it("a key pasted with spaces and a CR still works", () => {
    encryptInto(nightly(), "20261118T023000Z_v0.12.0.dump.age", "DUMPDATA");
    const result = restore(["--test", "latest"], `  ${secretKey}\r`);
    expect(result.status, result.stderr).toBe(0);
  });
});
