import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { hold } = vi.hoisted(() => ({
  hold: { applyHoldRule: vi.fn(async () => ({ bookings: 0, umbrellas: 0 })) },
}));

vi.mock("@/lib/booking/hold", () => hold);
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  hold.applyHoldRule.mockClear();
});

afterEach(() => vi.useRealTimers());

describe("startHoldJob", () => {
  it("runs at once, then every minute, and only one timer however often it starts", async () => {
    const { startHoldJob, HOLD_JOB_INTERVAL_MS } = await import("@/lib/booking/hold-job");
    startHoldJob();
    startHoldJob();
    expect(hold.applyHoldRule).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(HOLD_JOB_INTERVAL_MS * 2);
    expect(hold.applyHoldRule).toHaveBeenCalledTimes(3);
  });

  it("logs a failed run and keeps going", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    hold.applyHoldRule.mockRejectedValueOnce(new Error("db down"));
    const { startHoldJob, HOLD_JOB_INTERVAL_MS } = await import("@/lib/booking/hold-job");
    startHoldJob();
    await vi.advanceTimersByTimeAsync(HOLD_JOB_INTERVAL_MS);
    expect(error).toHaveBeenCalledWith("hold job failed", expect.any(Error));
    expect(hold.applyHoldRule).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});
