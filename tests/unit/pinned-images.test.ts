import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Dependabot updates the Dockerfiles and docker-compose.yml only (ADR 0028). Every other copy
// of an image (scripts, CI services, the test database) must follow them, pinned the same way.

const ROOT = resolve(__dirname, "../..");
const FILES = [
  "Dockerfile",
  "android/Dockerfile",
  "docker-compose.yml",
  "docker-compose.test.yml",
  ".github/workflows/ci.yml",
  "scripts/setup-wsl.sh",
  "scripts/build-android.sh",
];
const IMAGE = /\b(node|postgres|caddy|gradle):\d[\w.-]*(@sha256:[0-9a-f]{64})?/g;

function references(): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>();
  for (const file of FILES) {
    for (const match of readFileSync(resolve(ROOT, file), "utf8").matchAll(IMAGE)) {
      const [reference, name] = match;
      found.set(name!, (found.get(name!) ?? new Set()).add(`${reference} (${file})`));
    }
  }
  return found;
}

describe("base images", () => {
  it("are pinned by digest everywhere", () => {
    for (const refs of references().values()) {
      for (const ref of refs) expect(ref).toMatch(/@sha256:[0-9a-f]{64} /);
    }
  });

  it("are the same version and digest in every file", () => {
    for (const [name, refs] of references()) {
      const distinct = new Set([...refs].map((ref) => ref.split(" ")[0]));
      expect(distinct.size, `${name}: ${[...refs].join(", ")}`).toBe(1);
    }
  });

  it("are all found (the list of files is up to date)", () => {
    expect([...references().keys()].sort()).toEqual(["caddy", "gradle", "node", "postgres"]);
  });
});
