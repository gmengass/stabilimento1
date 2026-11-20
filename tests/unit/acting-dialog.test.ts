// @vitest-environment jsdom
import { createElement, useState, type ReactElement } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/en.json";

const { choose, clear } = vi.hoisted(() => ({
  choose: vi.fn(async () => ({ ok: true as const })),
  clear: vi.fn(async () => ({ ok: true as const })),
}));
vi.mock("@/app/(app)/acting-actions", () => ({
  chooseActingAction: choose,
  clearActingAction: clear,
}));

import { ActingBadge, ActingProvider, useActing } from "@/components/acting";

const choices = [
  { id: "a1", name: "Anna" },
  { id: "b1", name: "Bruno" },
];

beforeAll(() => {
  // jsdom has no <dialog> methods.
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

function Probe({ call }: { call: () => Promise<unknown> }) {
  const { run } = useActing();
  const [result, setResult] = useState("none");
  return createElement(
    "button",
    { onClick: async () => setResult(JSON.stringify(await run(call))) },
    `go:${result}`,
  );
}

// createElement's overloads reject components that need children; these tests pass them variadically.
const h = createElement as unknown as (
  type: unknown,
  props: unknown,
  ...children: unknown[]
) => ReactElement;

function mount(call: () => Promise<unknown>, props: { communal: boolean; initialName?: string }) {
  const acting = h(
    ActingProvider,
    { communal: props.communal, choices, initialName: props.initialName ?? null },
    h(ActingBadge, null),
    h(Probe, { call }),
  );
  render(h(NextIntlClientProvider, { locale: "en", messages }, acting));
}

const needsActor = { ok: false, error: "needsActor" };

describe("ActingProvider (ADR 0024)", () => {
  it("runs an action straight through when no one needs to be asked", async () => {
    const call = vi.fn(async () => ({ ok: true }));
    mount(call, { communal: false });
    fireEvent.click(screen.getByRole("button", { name: /go:/ }));
    await screen.findByText('go:{"ok":true}');
    expect(call).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Who is doing this?")).toBeNull();
  });

  it("asks who is acting, then retries the same action once", async () => {
    const call = vi.fn().mockResolvedValueOnce(needsActor).mockResolvedValueOnce({ ok: true });
    mount(call, { communal: true });
    fireEvent.click(screen.getByRole("button", { name: /go:/ }));
    await screen.findByText("Who is doing this?");
    fireEvent.click(screen.getByRole("button", { name: "Bruno" }));
    await screen.findByText('go:{"ok":true}');
    expect(choose).toHaveBeenCalledWith({ staffId: "b1" });
    expect(call).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Acting as Bruno")).toBeTruthy();
  });

  it("does nothing when the pop-up is cancelled", async () => {
    const call = vi.fn(async () => needsActor);
    mount(call, { communal: true });
    fireEvent.click(screen.getByRole("button", { name: /go:/ }));
    await screen.findByText("Who is doing this?");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await screen.findByText("go:null");
    expect(call).toHaveBeenCalledTimes(1);
    expect(choose).not.toHaveBeenCalled();
  });

  it("keeps the pop-up open and says so when the choice is refused", async () => {
    choose.mockResolvedValueOnce({ ok: false, error: "invalid" } as never);
    const call = vi.fn(async () => needsActor);
    mount(call, { communal: true });
    fireEvent.click(screen.getByRole("button", { name: /go:/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Anna" }));
    await screen.findByText("Could not choose. Try again.");
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("shows who is acting and clears it on 'Not me'", async () => {
    mount(async () => ({ ok: true }), { communal: true, initialName: "Anna" });
    expect(screen.getByText("Acting as Anna")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Not me" }));
    await waitFor(() => expect(screen.queryByText("Acting as Anna")).toBeNull());
    expect(clear).toHaveBeenCalled();
  });

  it("forgets who is acting after 2 minutes idle", async () => {
    vi.useFakeTimers();
    mount(async () => ({ ok: true }), { communal: true, initialName: "Anna" });
    expect(screen.getByText("Acting as Anna")).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(2 * 60 * 1000 + 1);
    });
    expect(screen.queryByText("Acting as Anna")).toBeNull();
  });

  it("shows no label on a normal account", () => {
    mount(async () => ({ ok: true }), { communal: false, initialName: "Anna" });
    expect(screen.queryByText("Acting as Anna")).toBeNull();
  });

  it("keeps the label when 'Not me' fails on the server", async () => {
    clear.mockResolvedValueOnce({ ok: false, error: "forbidden" } as never);
    mount(async () => ({ ok: true }), { communal: true, initialName: "Anna" });
    fireEvent.click(screen.getByRole("button", { name: "Not me" }));
    await waitFor(() => expect(clear).toHaveBeenCalled());
    expect(screen.getByText("Acting as Anna")).toBeTruthy();
  });

  it("retries every action that was waiting once a name is chosen", async () => {
    const first = vi.fn().mockResolvedValueOnce(needsActor).mockResolvedValueOnce({ ok: true });
    const second = vi.fn().mockResolvedValueOnce(needsActor).mockResolvedValueOnce({ ok: true });
    render(
      h(
        NextIntlClientProvider,
        { locale: "en", messages },
        h(
          ActingProvider,
          { communal: true, choices, initialName: null },
          h(Probe, { call: first }),
          h(Probe, { call: second }),
        ),
      ),
    );
    const [a, b] = screen.getAllByRole("button", { name: /go:/ });
    fireEvent.click(a!);
    fireEvent.click(b!);
    fireEvent.click(await screen.findByRole("button", { name: "Anna" }));
    await waitFor(() => expect(screen.getAllByText('go:{"ok":true}')).toHaveLength(2));
    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it("asks again when the retry still needs an actor", async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce(needsActor)
      .mockResolvedValueOnce(needsActor)
      .mockResolvedValueOnce({ ok: true });
    mount(call, { communal: true });
    fireEvent.click(screen.getByRole("button", { name: /go:/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Anna" }));
    await waitFor(() => expect(call).toHaveBeenCalledTimes(2));
    fireEvent.click(await screen.findByRole("button", { name: "Bruno" }));
    await screen.findByText('go:{"ok":true}');
    expect(call).toHaveBeenCalledTimes(3);
  });
});
