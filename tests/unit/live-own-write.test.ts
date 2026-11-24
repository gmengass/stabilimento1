import { afterEach, describe, expect, it } from "vitest";
import { isOwnWrite, markOwnWrite, OWN_WRITE_MS, ownWrite } from "@/lib/live/own-write";

// An admin page's own save must not show up as a change from another device (ADR 0030).

afterEach(() => markOwnWrite(Number.NEGATIVE_INFINITY));

describe("own writes", () => {
  it("is nothing until a save, then for OWN_WRITE_MS after it", () => {
    expect(isOwnWrite(1_000)).toBe(false);
    markOwnWrite(1_000);
    expect(isOwnWrite(1_000 + OWN_WRITE_MS)).toBe(true);
    expect(isOwnWrite(1_001 + OWN_WRITE_MS)).toBe(false);
  });

  it("marks a save when it starts and again when it returns, even if it fails", async () => {
    let duringCall = false;
    await expect(
      ownWrite(async () => {
        duringCall = isOwnWrite();
        throw new Error("refused");
      }),
    ).rejects.toThrow("refused");
    expect(duringCall).toBe(true);
    expect(isOwnWrite()).toBe(true);
  });
});
