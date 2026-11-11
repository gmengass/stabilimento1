import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Runs scripts/update.sh and scripts/rollback.sh under dash against a throwaway git repo and a
// stub `docker` that records its calls (ADR 0008). Real Docker runs only in CI.

const SCRIPTS = resolve(__dirname, "../../scripts");
const HEALTHY = '{"status":"ok","db":"ok"}';

const DOCKER_STUB = `#!/bin/sh
printf '%s\\n' "$*" >>"$DOCKER_LOG"
case "$*" in
  *pg_dump*) printf 'DUMPDATA' ;;
  *wget*) [ "\${STUB_HEALTH:-ok}" = ok ] && printf '%s' '${HEALTHY}' || exit 1 ;;
  *"image ls"*) printf '%s\\n' \${STUB_IMAGES:-} ;;
esac
`;

let repo: string;
let bin: string;
let dockerLog: string;

function git(...args: string[]): void {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
}

function release(tag: string): void {
  writeFileSync(join(repo, "VERSION"), `${tag}\n`);
  git("add", "-A");
  git("commit", "-qm", tag);
  git("tag", tag);
}

interface Run {
  status: number | null;
  stderr: string;
  calls: string[];
}

function run(script: string, args: string[] = [], env: Record<string, string> = {}): Run {
  writeFileSync(dockerLog, "");
  const result = spawnSync("dash", [join(repo, "scripts", script), ...args], {
    cwd: repo,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      DOCKER_LOG: dockerLog,
      HEALTH_RETRIES: "2",
      HEALTH_DELAY: "0",
      ...env,
    },
  });
  const calls = readFileSync(dockerLog, "utf8").split("\n").filter(Boolean);
  return { status: result.status, stderr: result.stderr, calls };
}

function state(name: string): string | undefined {
  const file = join(repo, ".deploy", name);
  return existsSync(file) ? readFileSync(file, "utf8").trim() : undefined;
}

function indexOf(calls: string[], fragment: string): number {
  const index = calls.findIndex((call) => call.includes(fragment));
  if (index < 0) throw new Error(`no docker call containing "${fragment}":\n${calls.join("\n")}`);
  return index;
}

beforeEach(() => {
  const root = mkdtempSync(join(tmpdir(), "deploy-test-"));
  repo = join(root, "repo");
  bin = join(root, "bin");
  dockerLog = join(root, "docker.log");
  cpSync(SCRIPTS, join(repo, "scripts"), { recursive: true });
  spawnSync("mkdir", ["-p", bin]);
  writeFileSync(join(bin, "docker"), DOCKER_STUB);
  chmodSync(join(bin, "docker"), 0o755);
  writeFileSync(join(repo, ".gitignore"), ".env\n.deploy/\nbackups/\n");
  writeFileSync(join(repo, ".env"), "POSTGRES_PASSWORD=x\n");
  git("init", "-q");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "test");
  release("v0.0.1");
  release("v0.0.2");
});

afterEach(() => {
  rmSync(join(repo, ".."), { recursive: true, force: true });
});

describe("update.sh refusals", () => {
  it.each(["", "latest", "v1.2", "1.2.3", "v1.2.3-rc1"])("rejects the tag '%s'", (tag) => {
    const result = run("update.sh", [tag]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/usage: update\.sh vX\.Y\.Z/);
    expect(result.calls).toEqual([]);
  });

  it("refuses without .env", () => {
    rmSync(join(repo, ".env"));
    const result = run("update.sh", ["v0.0.1"]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/\.env missing/);
    expect(result.calls).toEqual([]);
  });

  it("refuses a dirty working tree", () => {
    writeFileSync(join(repo, "VERSION"), "edited\n");
    const result = run("update.sh", ["v0.0.1"]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/local changes/);
    expect(result.calls).toEqual([]);
  });

  it("refuses an unknown tag", () => {
    const result = run("update.sh", ["v9.9.9"]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/tag v9\.9\.9 not found/);
    expect(result.calls).toEqual([]);
  });

  it("refuses while another deploy holds the lock", () => {
    run("update.sh", ["v0.0.1"]);
    spawnSync("mkdir", [join(repo, ".deploy", "lock")]);
    const result = run("update.sh", ["v0.0.2"]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/another deploy or backup is running/);
  });
});

describe("update.sh", () => {
  it("first install: no backup, migrates before starting, records the release", () => {
    const result = run("update.sh", ["v0.0.1"]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.calls.some((call) => call.includes("pg_dump"))).toBe(false);
    expect(indexOf(result.calls, "compose build app migrate")).toBeLessThan(
      indexOf(result.calls, "compose run --rm migrate"),
    );
    expect(indexOf(result.calls, "compose run --rm migrate")).toBeLessThan(
      indexOf(result.calls, "compose up -d --no-deps app caddy"),
    );
    expect(state("current")).toBe("v0.0.1");
    expect(state("previous")).toBeUndefined();
    expect(existsSync(join(repo, ".deploy", "lock"))).toBe(false);
  });

  it("update: backup → build → stop app → migrate → start, then records both releases", () => {
    run("update.sh", ["v0.0.1"]);
    const result = run("update.sh", ["v0.0.2"]);
    expect(result.status, result.stderr).toBe(0);
    const order = [
      "pg_dump",
      "compose build app migrate",
      "compose stop app",
      "compose run --rm migrate",
      "compose up -d --no-deps app caddy",
      "wget",
    ].map((fragment) => indexOf(result.calls, fragment));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(readFileSync(join(repo, "VERSION"), "utf8").trim()).toBe("v0.0.2");
    expect(state("current")).toBe("v0.0.2");
    expect(state("previous")).toBe("v0.0.1");
    const dump = state("last-backup") ?? "";
    expect(dump).toMatch(/backups\/pre-update\/\d{8}T\d{6}Z_v0\.0\.1-before-v0\.0\.2\.dump$/);
    expect(readFileSync(dump, "utf8")).toBe("DUMPDATA");
  });

  it("a failed health check exits non-zero, keeps the old state and prints the rollback command", () => {
    run("update.sh", ["v0.0.1"]);
    const result = run("update.sh", ["v0.0.2"], { STUB_HEALTH: "fail" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/did not pass the health check/);
    expect(result.stderr).toMatch(/scripts\/rollback\.sh/);
    expect(state("current")).toBe("v0.0.1");
    expect(existsSync(join(repo, ".deploy", "lock"))).toBe(false);
  });

  it("keeps only the images of the newest 3 releases", () => {
    const result = run("update.sh", ["v0.0.1"], {
      STUB_IMAGES: "v0.0.1 v0.0.10 v0.0.9 v0.0.2 dev",
    });
    expect(result.status, result.stderr).toBe(0);
    const removed = result.calls.filter((call) => call.startsWith("image rm"));
    expect(removed).toEqual([
      "image rm stabilimento-app:v0.0.1",
      "image rm stabilimento-migrate:v0.0.1",
    ]);
  });
});

describe("rollback.sh", () => {
  it("refuses when no previous release is recorded", () => {
    run("update.sh", ["v0.0.1"]);
    const result = run("rollback.sh", ["--yes"]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/nothing to roll back to/);
  });

  it("aborts unless the operator types yes", () => {
    run("update.sh", ["v0.0.1"]);
    run("update.sh", ["v0.0.2"]);
    const result = run("rollback.sh");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/will be LOST/);
    expect(state("current")).toBe("v0.0.2");
  });

  it("restores the pre-update dump into a re-created database and starts the previous release", () => {
    run("update.sh", ["v0.0.1"]);
    run("update.sh", ["v0.0.2"]);
    const result = run("rollback.sh", ["--yes"]);
    expect(result.status, result.stderr).toBe(0);
    const order = [
      "compose stop app",
      "dropdb",
      "pg_restore",
      "compose up -d --no-deps app caddy",
    ].map((fragment) => indexOf(result.calls, fragment));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(
      result.calls.some((call) => call.includes("build") || call.includes("run --rm migrate")),
    ).toBe(false);
    expect(readFileSync(join(repo, "VERSION"), "utf8").trim()).toBe("v0.0.1");
    expect(state("current")).toBe("v0.0.1");
    expect(state("previous")).toBeUndefined();
    expect(state("last-backup")).toBeUndefined();
  });
});
