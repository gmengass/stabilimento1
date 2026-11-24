// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/en.json";
import { FakeEventSource } from "./live-fake-source";

const router = { refresh: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { LiveRefresh } from "@/components/live-refresh";
import type { LiveSignal } from "@/lib/live/live-connection";

// The map and the Prezzi page refresh their server data themselves (ADR 0019, ADR 0030).

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
});

function mount(signals?: readonly LiveSignal[]) {
  render(
    createElement(
      NextIntlClientProvider,
      { locale: "en", messages } as never,
      createElement(LiveRefresh, signals ? { signals } : {}),
    ),
  );
  return FakeEventSource.last!;
}

/** Refreshes once the debounce has passed. */
async function refreshesAfter(emit: () => void): Promise<number> {
  router.refresh.mockClear();
  emit();
  await vi.advanceTimersByTimeAsync(2_500);
  return router.refresh.mock.calls.length;
}

describe("LiveRefresh", () => {
  it("the map: catches up on open, follows changes, ignores setup", async () => {
    const source = mount();
    expect(await refreshesAfter(() => source.emit("open"))).toBe(1);
    expect(await refreshesAfter(() => source.emit("changed"))).toBe(1);
    expect(await refreshesAfter(() => source.emit("setup"))).toBe(0);
  });

  it("the Prezzi page follows setup, not bookings", async () => {
    const source = mount(["setup"]);
    expect(await refreshesAfter(() => source.emit("open"))).toBe(1);
    expect(await refreshesAfter(() => source.emit("changed"))).toBe(0);
    expect(await refreshesAfter(() => source.emit("setup"))).toBe(1);
  });

  it("debounces a burst of signals into one refresh", async () => {
    const source = mount();
    await refreshesAfter(() => source.emit("open"));
    expect(
      await refreshesAfter(() => {
        source.emit("changed");
        source.emit("changed");
        source.emit("resync");
      }),
    ).toBe(1);
  });
});
