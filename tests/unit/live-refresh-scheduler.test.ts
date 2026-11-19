import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backoffDelay, createRefreshScheduler } from "@/lib/live/refresh-scheduler";

/** A refresh the test finishes by hand, to hold it "in flight". */
function manualRefresh() {
  const finishers: (() => void)[] = [];
  const refresh = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finishers.push(resolve);
      }),
  );
  const finish = async () => {
    finishers.shift()?.();
    await vi.advanceTimersByTimeAsync(0);
  };
  return { refresh, finish };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createRefreshScheduler: longest wait", () => {
  it("refreshes during a steady stream of signals, not only after it stops", async () => {
    const refresh = vi.fn();
    const scheduler = createRefreshScheduler({ refresh });
    for (let i = 0; i < 10; i++) {
      scheduler.notify();
      await vi.advanceTimersByTimeAsync(300);
    }
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("starts a new wait after each refresh", async () => {
    const refresh = vi.fn();
    const scheduler = createRefreshScheduler({ refresh, maxWaitMs: 1_000 });
    for (let i = 0; i < 12; i++) {
      scheduler.notify();
      await vi.advanceTimersByTimeAsync(300);
    }
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("still waits the full quiet period when signals are rare", async () => {
    const refresh = vi.fn();
    const scheduler = createRefreshScheduler({ refresh });
    scheduler.notify();
    await vi.advanceTimersByTimeAsync(399);
    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("createRefreshScheduler: trailing debounce", () => {
  it("refreshes once, 400 ms after the last notify by default", async () => {
    const refresh = vi.fn();
    const scheduler = createRefreshScheduler({ refresh });
    scheduler.notify();
    await vi.advanceTimersByTimeAsync(399);
    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("collapses a burst into one refresh after the quiet period", async () => {
    const refresh = vi.fn();
    const scheduler = createRefreshScheduler({ refresh });
    scheduler.notify();
    await vi.advanceTimersByTimeAsync(300);
    scheduler.notify();
    await vi.advanceTimersByTimeAsync(300);
    scheduler.notify();
    await vi.advanceTimersByTimeAsync(399);
    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("uses a custom debounce", async () => {
    const refresh = vi.fn();
    const scheduler = createRefreshScheduler({ refresh, debounceMs: 50 });
    scheduler.notify();
    await vi.advanceTimersByTimeAsync(49);
    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("refreshes again for a notify that comes after the previous refresh finished", async () => {
    const refresh = vi.fn();
    const scheduler = createRefreshScheduler({ refresh });
    scheduler.notify();
    await vi.advanceTimersByTimeAsync(400);
    scheduler.notify();
    await vi.advanceTimersByTimeAsync(400);
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});

describe("createRefreshScheduler: one refresh in flight", () => {
  it("holds notifies during a flight and runs exactly one more refresh after it", async () => {
    const { refresh, finish } = manualRefresh();
    const scheduler = createRefreshScheduler({ refresh });
    scheduler.notify();
    await vi.advanceTimersByTimeAsync(400);
    expect(refresh).toHaveBeenCalledTimes(1);

    scheduler.notify();
    await vi.advanceTimersByTimeAsync(400);
    scheduler.notify();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(refresh).toHaveBeenCalledTimes(1);

    await finish();
    await vi.advanceTimersByTimeAsync(400);
    expect(refresh).toHaveBeenCalledTimes(2);

    await finish();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("does no extra refresh when nothing was notified during the flight", async () => {
    const { refresh, finish } = manualRefresh();
    const scheduler = createRefreshScheduler({ refresh });
    scheduler.notify();
    await vi.advanceTimersByTimeAsync(400);
    await finish();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("keeps working after a refresh fails", async () => {
    const refresh = vi.fn<() => Promise<void>>().mockRejectedValueOnce(new Error("offline"));
    refresh.mockResolvedValue(undefined);
    const scheduler = createRefreshScheduler({ refresh });
    scheduler.notify();
    await vi.advanceTimersByTimeAsync(400);
    scheduler.notify();
    await vi.advanceTimersByTimeAsync(400);
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});

describe("createRefreshScheduler: dispose", () => {
  it("cancels a pending refresh", async () => {
    const refresh = vi.fn();
    const scheduler = createRefreshScheduler({ refresh });
    scheduler.notify();
    await vi.advanceTimersByTimeAsync(200);
    scheduler.dispose();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(refresh).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels the follow-up queued during a flight", async () => {
    const { refresh, finish } = manualRefresh();
    const scheduler = createRefreshScheduler({ refresh });
    scheduler.notify();
    await vi.advanceTimersByTimeAsync(400);
    scheduler.notify();
    scheduler.dispose();
    await finish();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("backoffDelay", () => {
  it.each([
    // [attempt, random, delay]
    [0, 0, 500],
    [0, 0.5, 750],
    [1, 0.5, 1_500],
    [3, 0.5, 6_000],
    [4, 0, 8_000],
    [5, 0, 15_000],
    [5, 0.5, 22_500],
    [100, 0, 15_000],
  ])("attempt %i with random %f waits %i ms", (attempt, random, delay) => {
    expect(backoffDelay(attempt, () => random)).toBe(delay);
  });

  it("stays below the uncapped base and the 30 s cap", () => {
    expect(backoffDelay(0, () => 0.999_999)).toBeLessThan(1_000);
    expect(backoffDelay(1_000, () => 0.999_999)).toBeLessThan(30_000);
    expect(Number.isFinite(backoffDelay(10_000, () => 0.5))).toBe(true);
  });

  it("jitters with Math.random by default", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    expect(backoffDelay(2)).toBe(3_000);
    expect(random).toHaveBeenCalled();
    random.mockRestore();
  });
});
