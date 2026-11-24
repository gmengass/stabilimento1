// @vitest-environment jsdom
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/en.json";
import { FakeEventSource } from "./live-fake-source";

const router = { refresh: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { LiveNotice, type LiveNoticeKind } from "@/components/live-notice";
import { markOwnWrite, OWN_WRITE_MS } from "@/lib/live/own-write";

// Search and admin pages don't refresh under the user; they offer a reload (ADR 0030).

const reload = vi.fn();

beforeEach(() => {
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal("location", { ...window.location, reload });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
  markOwnWrite(Number.NEGATIVE_INFINITY);
});

function show(kind: LiveNoticeKind) {
  render(
    createElement(
      NextIntlClientProvider,
      { locale: "en", messages } as never,
      createElement(LiveNotice, { kind }),
    ),
  );
  const source = FakeEventSource.last!;
  source.emit("open");
  return source;
}

const changed = () => screen.queryByTestId("live-changed");

describe("LiveNotice", () => {
  it("admin pages: shows the notice on a setup change, not on bookings or a reopen", () => {
    const source = show("setup");
    source.emit("changed");
    source.emit("open");
    expect(changed()).toBeNull();
    source.emit("setup");
    expect(changed()?.textContent).toContain(messages.live.setupChanged);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("search: shows the notice when bookings change, and reloads the page on request", () => {
    const source = show("bookings");
    source.emit("setup");
    expect(changed()).toBeNull();
    source.emit("changed");
    fireEvent.click(screen.getByRole("button", { name: messages.live.reload }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("a resync shows the notice: changes may have been missed", () => {
    show("setup").emit("resync");
    expect(changed()).not.toBeNull();
  });

  it("an outage shows 'reconnecting', not 'changed', and never re-renders the page", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ user: {} })),
    );
    const source = show("bookings");
    source.emit("error");
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    FakeEventSource.last!.emit("error");
    await act(() => vi.advanceTimersByTimeAsync(3_000));
    expect(screen.queryByTestId("live-status")).not.toBeNull();
    expect(changed()).toBeNull();
    expect(router.refresh).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith("/api/auth/get-session", { cache: "no-store" });
  });

  it("ignores the page's own save, then notices changes again", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const source = show("setup");
    markOwnWrite();
    source.emit("setup");
    expect(changed()).toBeNull();
    vi.setSystemTime(Date.now() + OWN_WRITE_MS + 1);
    source.emit("setup");
    expect(changed()).not.toBeNull();
  });
});
