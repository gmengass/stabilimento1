import { describe, expect, it } from "vitest";
import { parseAuthEnv, parseEnv } from "@/lib/env";

const valid = { DATABASE_URL: "postgresql://u:p@localhost:5432/booking" };

describe("parseEnv", () => {
  it("accepts a valid environment and applies defaults", () => {
    expect(parseEnv(valid)).toEqual({
      NODE_ENV: "development",
      DATABASE_URL: valid.DATABASE_URL,
      APP_URL: "http://localhost:3000",
      TRUSTED_ORIGINS: [],
    });
  });

  it("splits TRUSTED_ORIGINS on commas and trims spaces", () => {
    const env = parseEnv({
      ...valid,
      TRUSTED_ORIGINS: "https://192.168.1.10, https://box.tail1234.ts.net",
    });
    expect(env.TRUSTED_ORIGINS).toEqual(["https://192.168.1.10", "https://box.tail1234.ts.net"]);
  });

  it("treats an empty TRUSTED_ORIGINS as none", () => {
    expect(parseEnv({ ...valid, TRUSTED_ORIGINS: " " }).TRUSTED_ORIGINS).toEqual([]);
  });

  it.each([
    "http://192.168.1.10",
    "https://*",
    "https://*.local",
    "https://192.168.1.10/",
    "https://box.example/path",
    "https://Box.Example",
    "javascript:alert(1)",
  ])(
    "rejects the TRUSTED_ORIGINS entry %s (https origins only, no wildcards or paths)",
    (entry) => {
      expect(() => parseEnv({ ...valid, TRUSTED_ORIGINS: entry })).toThrow(/TRUSTED_ORIGINS/);
    },
  );

  it("rejects a TRUSTED_ORIGINS entry that is not a URL", () => {
    expect(() => parseEnv({ ...valid, TRUSTED_ORIGINS: "https://ok.example, not-a-url" })).toThrow(
      /TRUSTED_ORIGINS/,
    );
  });

  it("accepts the postgres:// scheme", () => {
    expect(parseEnv({ DATABASE_URL: "postgres://u:p@db/booking" }).DATABASE_URL).toBe(
      "postgres://u:p@db/booking",
    );
  });

  it("rejects a missing DATABASE_URL", () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });

  it("rejects a non-postgres DATABASE_URL", () => {
    expect(() => parseEnv({ DATABASE_URL: "mysql://u:p@localhost/booking" })).toThrow(
      /DATABASE_URL/,
    );
  });

  it("rejects an unknown NODE_ENV", () => {
    expect(() => parseEnv({ ...valid, NODE_ENV: "staging" })).toThrow(/NODE_ENV/);
  });
});

describe("parseAuthEnv", () => {
  it.each([
    ["missing", {}],
    ["empty", { AUTH_SECRET: "" }],
    ["31 characters", { AUTH_SECRET: "s".repeat(31) }],
  ])("rejects a %s AUTH_SECRET", (_label, source) => {
    expect(() => parseAuthEnv(source)).toThrow(/AUTH_SECRET/);
  });

  it.each([32, 64])("accepts a %i-character AUTH_SECRET", (length) => {
    const secret = "s".repeat(length);
    expect(parseAuthEnv({ AUTH_SECRET: secret })).toEqual({ AUTH_SECRET: secret });
  });

  it("does not need DATABASE_URL", () => {
    expect(() => parseAuthEnv({ AUTH_SECRET: "s".repeat(32) })).not.toThrow();
  });
});
