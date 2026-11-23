import { describe, expect, it } from "vitest";
import { parseAppDatabaseUrl, scramVerifier } from "@/db/app-role";

const GOOD = "postgresql://booking_app:0123456789abcdef0123456789abcdef@db:5432/booking";

describe("parseAppDatabaseUrl", () => {
  it("reads the user and password", () => {
    expect(parseAppDatabaseUrl(GOOD)).toEqual({
      user: "booking_app",
      password: "0123456789abcdef0123456789abcdef",
    });
  });

  it.each([
    ["not a URL", "booking_app:secret"],
    ["another scheme", GOOD.replace("postgresql:", "mysql:")],
    ["the .env.example password", GOOD.replace(/:[0-9a-f]{32}@/, ":change-me-app-0123456789ab@")],
    ["a short password", GOOD.replace(/:[0-9a-f]{32}@/, ":short@")],
    ["a password with quotes", GOOD.replace(/:[0-9a-f]{32}@/, `:${"a".repeat(24)}%27x@`)],
    ["no user", GOOD.replace("booking_app", "")],
  ])("refuses %s", (_case, url) => {
    expect(typeof parseAppDatabaseUrl(url)).toBe("string");
  });
});

describe("scramVerifier", () => {
  it("matches Postgres's stored format and is salted", () => {
    const salt = Buffer.alloc(16, 1);
    const verifier = scramVerifier("pencil", salt);
    expect(verifier).toMatch(
      /^SCRAM-SHA-256\$4096:[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/,
    );
    expect(verifier).toBe(scramVerifier("pencil", salt));
    expect(scramVerifier("pencil")).not.toBe(scramVerifier("pencil"));
  });
});
