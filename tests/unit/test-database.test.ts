import { afterEach, describe, expect, it, vi } from "vitest";
import { testDatabaseUrl } from "../integration/test-database";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("testDatabaseUrl", () => {
  it("accepts a database whose name ends in _test", () => {
    vi.stubEnv("TEST_DATABASE_URL", "postgresql://u:p@localhost/booking_test");
    expect(testDatabaseUrl()).toBe("postgresql://u:p@localhost/booking_test");
  });

  it("rejects a non-test database", () => {
    vi.stubEnv("TEST_DATABASE_URL", "postgresql://u:p@localhost/booking");
    expect(() => testDatabaseUrl()).toThrow(/must end in _test/);
  });

  it("rejects query parameters that could override the database", () => {
    vi.stubEnv("TEST_DATABASE_URL", "postgresql://u:p@localhost/booking_test?database=booking");
    expect(() => testDatabaseUrl()).toThrow(/query parameters/);
  });

  it("rejects a missing URL", () => {
    vi.stubEnv("TEST_DATABASE_URL", "");
    expect(() => testDatabaseUrl()).toThrow(/not set/);
  });
});
