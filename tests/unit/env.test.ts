import { describe, expect, it } from "vitest";
import { parseAuthEnv, parseEnv } from "@/lib/env";

const valid = { DATABASE_URL: "postgresql://u:p@localhost:5432/booking" };

describe("parseEnv", () => {
  it("accepts a valid environment and applies defaults", () => {
    expect(parseEnv(valid)).toEqual({
      NODE_ENV: "development",
      DATABASE_URL: valid.DATABASE_URL,
      APP_URL: "http://localhost:3000",
    });
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
