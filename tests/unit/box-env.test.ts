import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseAuthEnv, parseEnv } from "@/lib/env";

// scripts/lib/box-env.sh (used by scripts/setup-wsl.sh), run under dash.

const ROOT = resolve(__dirname, "../..");
const LIB = join(ROOT, "scripts/lib/box-env.sh");

let dir: string;

function sh(script: string): { status: number | null; stderr: string } {
  const result = spawnSync(
    "dash",
    ["-c", `die() { echo "$*" >&2; exit 1; }; . '${LIB}'; ${script}`],
    {
      cwd: dir,
      encoding: "utf8",
    },
  );
  return { status: result.status, stderr: result.stderr };
}

function readEnv(file: string): Record<string, string> {
  const entries = readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]);
  return Object.fromEntries(entries);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "box-env-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("write_box_env", () => {
  const create = () =>
    sh(`write_box_env .env '${join(ROOT, ".env.example")}' stabilimento.local 192.168.1.10`);

  it("creates an owner-only .env the app accepts, with fresh secrets", () => {
    expect(create().status).toBe(0);
    expect(statSync(join(dir, ".env")).mode & 0o777).toBe(0o600);
    const env = readEnv(join(dir, ".env"));
    expect(env).toMatchObject({
      APP_URL: "https://stabilimento.local",
      SITE_ADDRESS: "stabilimento.local, 192.168.1.10",
      TRUSTED_ORIGINS: "https://192.168.1.10",
      ADMIN_USERNAME: "",
      ADMIN_PASSWORD: "",
    });
    expect(env.POSTGRES_PASSWORD).toMatch(/^[0-9a-f]{48}$/);
    expect(env.AUTH_SECRET).toMatch(/^[0-9a-f]{64}$/);
    expect(parseEnv(env).TRUSTED_ORIGINS).toEqual(["https://192.168.1.10"]);
    expect(() => parseAuthEnv(env)).not.toThrow();
  });

  it("generates different secrets each time", () => {
    create();
    const first = readEnv(join(dir, ".env"));
    rmSync(join(dir, ".env"));
    create();
    expect(readEnv(join(dir, ".env")).AUTH_SECRET).not.toBe(first.AUTH_SECRET);
  });

  it("writes nothing when openssl fails, so a re-run starts clean", () => {
    const result = sh(
      `openssl() { return 1; }; write_box_env .env '${join(ROOT, ".env.example")}' box.local 192.168.1.10`,
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/could not generate secrets/);
    expect(existsSync(join(dir, ".env"))).toBe(false);
    expect(existsSync(join(dir, ".env.draft"))).toBe(false);
  });

  it("never overwrites an existing .env", () => {
    writeFileSync(join(dir, ".env"), "AUTH_SECRET=keep-me\n");
    const result = create();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/already exists/);
    expect(readFileSync(join(dir, ".env"), "utf8")).toBe("AUTH_SECRET=keep-me\n");
  });
});

describe("write_box_env input checks", () => {
  const create = (name: string, ip: string) =>
    sh(`write_box_env .env '${join(ROOT, ".env.example")}' '${name}' '${ip}'`);

  it.each([
    "http://stabilimento.local",
    "stabilimento.local, other",
    "a{b}",
    "-bad.local",
    "with space.local",
    "",
  ])("rejects the name %j", (name) => {
    const result = create(name, "192.168.1.10");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/name/);
  });

  it.each([
    "192.168.1",
    "192.168.1.256",
    "0.0.0.0",
    "127.0.0.1",
    "192.168.1.10,10.0.0.1",
    "fe80::1",
    "",
  ])("rejects the IP %j", (ip) => {
    const result = create("stabilimento.local", ip);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/IP/);
  });

  it("accepts a single-label Windows PC name and lowercases it", () => {
    expect(create("CLUB-PC", "10.0.0.5").status).toBe(0);
    expect(readEnv(join(dir, ".env"))).toMatchObject({
      APP_URL: "https://club-pc",
      SITE_ADDRESS: "club-pc, 10.0.0.5",
    });
  });
});

describe("set_env_value", () => {
  it("writes values literally: no sed escapes, newlines or & expansion", () => {
    writeFileSync(join(dir, "f"), "A=1\nB=2\n");
    expect(sh("set_env_value f A 'x\\ny&z'").status).toBe(0);
    expect(readFileSync(join(dir, "f"), "utf8")).toBe("A=x\\ny&z\nB=2\n");
  });

  it("replaces an existing key and appends a missing one", () => {
    writeFileSync(join(dir, "f"), "A=1\nB=2\n");
    expect(sh("set_env_value f A 'x y' && set_env_value f C 3").status).toBe(0);
    expect(readFileSync(join(dir, "f"), "utf8")).toBe("A=x y\nB=2\nC=3\n");
  });

  it("refuses a value containing a newline", () => {
    writeFileSync(join(dir, "f"), "A=1\n");
    expect(sh("set_env_value f A \"$(printf 'a\\nB=evil')\"").status).not.toBe(0);
    expect(readFileSync(join(dir, "f"), "utf8")).toBe("A=1\n");
  });
});

describe("setup-wsl.sh", () => {
  const run = (...args: string[]) =>
    spawnSync("dash", [join(ROOT, "scripts/setup-wsl.sh"), ...args], { encoding: "utf8" });

  it("needs a release tag", () => {
    const result = run();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/usage: sh scripts\/setup-wsl\.sh vX\.Y\.Z/);
  });

  // On a WSL dev machine this would start the real setup, so it only runs elsewhere.
  const onWsl = /microsoft/i.test(readFileSync("/proc/version", "utf8"));
  it.skipIf(onWsl)("refuses to run outside WSL", () => {
    const result = run("v0.1.0");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/this script is for WSL2/);
  });
});
