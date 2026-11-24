// @vitest-environment jsdom
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/en.json";

const router = { refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { LiveNotice, OWN_WRITE_MS, type LiveNoticeKind } from "@/components/live-notice";

// Search and admin pages don't refresh under the user; they offer a reload (ADR 0030).

class FakeEventSource {
  static last: FakeEventSource | undefined;
  private listeners = new Map<string, () => void>();
  constructor() {
    FakeEventSource.last = this;
  }
  addEventListener(type: string, listener: () => void) {
    this.listeners.set(type, listener);
  }
  close() {}
  emit(type: string) {
    act(() => this.listeners.get(type)?.());
  }
}

const reload = vi.fn();

beforeEach(() => {
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal("location", { ...window.location, reload });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  reload.mockClear();
  router.refresh.mockClear();
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

describe("LiveNotice", () => {
  it("admin pages: shows the notice on a setup change, not on bookings or a reopen", () => {
    const source = show("setup");
    source.emit("changed");
    source.emit("open");
    expect(screen.queryByTestId("live-changed")).toBeNull();
    source.emit("setup");
    expect(screen.getByTestId("live-changed").textContent).toContain(messages.live.setupChanged);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("search: shows the notice when bookings change, and reloads the page on request", () => {
    const source = show("bookings");
    source.emit("setup");
    expect(screen.queryByTestId("live-changed")).toBeNull();
    source.emit("changed");
    fireEvent.click(screen.getByRole("button", { name: messages.live.reload }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("ignores the page's own save, then notices changes again", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const source = show("setup");
      const form = document.body.appendChild(document.createElement("form"));
      fireEvent.submit(form);
      source.emit("setup");
      expect(screen.queryByTestId("live-changed")).toBeNull();
      vi.setSystemTime(Date.now() + OWN_WRITE_MS + 1);
      source.emit("setup");
      expect(screen.getByTestId("live-changed")).toBeTruthy();
      form.remove();
    } finally {
      vi.useRealTimers();
    }
  });
});
