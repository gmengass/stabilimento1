import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

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
