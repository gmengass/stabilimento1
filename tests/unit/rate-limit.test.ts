import { beforeEach, describe, expect, it, vi } from "vitest";
import { hit, resetRateLimits } from "@/lib/rate-limit";

const { requestHeaders } = vi.hoisted(() => ({ requestHeaders: { current: new Headers() } }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => requestHeaders.current) }));

const { withinLimit, SEARCH_LIMIT, ACTION_LIMIT } = await import("@/lib/auth/request-limits");

const limit = { max: 3, windowMs: 60_000 };

beforeEach(() => {
  resetRateLimits();
  requestHeaders.current = new Headers();
});

describe("hit", () => {
  it("allows up to the maximum in a window, then refuses", () => {
    expect([1, 2, 3].map(() => hit(["k"], limit, 0))).toEqual([true, true, true]);
    expect(hit(["k"], limit, 59_999)).toBe(false);
  });

  it("opens a new window once the old one has passed", () => {
    for (let i = 0; i < 4; i++) hit(["k"], limit, 0);
    expect(hit(["k"], limit, 60_000)).toBe(true);
  });

  it("refuses when any key is over, and counts every key", () => {
    for (let i = 0; i < 3; i++) hit(["a"], limit, 0);
    expect(hit(["a", "b"], limit, 0)).toBe(false);
    expect(hit(["b"], limit, 0)).toBe(true);
    expect(hit(["b"], limit, 0)).toBe(true);
    expect(hit(["b"], limit, 0)).toBe(false);
  });

  it("keeps keys apart", () => {
    for (let i = 0; i < 4; i++) hit(["a"], limit, 0);
    expect(hit(["c"], limit, 0)).toBe(true);
  });
});

describe("withinLimit", () => {
  const anna = { id: "u1", communal: false, sessionId: "s1" };
  const tablet = { id: "c1", communal: true, sessionId: "t1" };

  it("limits searches per account", async () => {
    for (let i = 0; i < SEARCH_LIMIT.max; i++) await withinLimit("search", anna);
    await expect(withinLimit("search", anna)).resolves.toBe(false);
    await expect(withinLimit("search", { ...anna, sessionId: "s2" })).resolves.toBe(false);
    await expect(withinLimit("action", anna)).resolves.toBe(true);
  });

  it("limits each tablet of a communal account on its own (ADR 0025)", async () => {
    for (let i = 0; i < SEARCH_LIMIT.max; i++) await withinLimit("search", tablet);
    await expect(withinLimit("search", tablet)).resolves.toBe(false);
    await expect(withinLimit("search", { ...tablet, sessionId: "t2" })).resolves.toBe(true);
  });

  it("also counts the client address, so new tablet sessions don't reset it", async () => {
    requestHeaders.current = new Headers({ "x-real-ip": "192.168.1.50" });
    for (let i = 0; i < ACTION_LIMIT.max; i++) {
      await withinLimit("action", { ...tablet, sessionId: `t${i}` });
    }
    await expect(withinLimit("action", { ...tablet, sessionId: "fresh" })).resolves.toBe(false);
  });
});
