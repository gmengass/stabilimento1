import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLiveConnection,
  NOTICE_DELAY_MS,
  WATCHDOG_MS,
  type LiveSource,
} from "@/lib/live/live-connection";

class FakeSource implements LiveSource {
  closed = false;
  private listeners = new Map<string, () => void>();
  addEventListener(type: string, listener: () => void) {
    this.listeners.set(type, listener);
  }
  close() {
    this.closed = true;
  }
  emit(type: "open" | "error" | "changed" | "resync") {
    this.listeners.get(type)?.();
  }
}

function setup(online = true) {
  const sources: FakeSource[] = [];
  const state = { online };
  const onRefresh = vi.fn();
  const onNotice = vi.fn();
  const connection = createLiveConnection({
    createSource: () => {
      const source = new FakeSource();
      sources.push(source);
      return source;
    },
    isOnline: () => state.online,
    onRefresh,
    onNotice,
    random: () => 0,
  });
  const latest = () => sources[sources.length - 1];
  const noticeShown = () => onNotice.mock.calls.at(-1)?.[0] === true;
  return { connection, sources, latest, state, onRefresh, onNotice, noticeShown };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createLiveConnection", () => {
  it("refreshes on the first open, then on every signal", () => {
    const { connection, latest, onRefresh } = setup();
    connection.start();
    expect(onRefresh).not.toHaveBeenCalled();
    latest().emit("open");
    expect(onRefresh).toHaveBeenCalledTimes(1);
    latest().emit("changed");
    latest().emit("resync");
    expect(onRefresh).toHaveBeenCalledTimes(3);
    connection.dispose();
  });

  it("reconnects with backoff after an error and shows the notice only after 2 s", () => {
    const { connection, sources, latest, noticeShown, onNotice } = setup();
    connection.start();
    latest().emit("open");
    latest().emit("error");
    expect(sources[0].closed).toBe(true);
    // attempt 0 with random 0: 500 ms.
    vi.advanceTimersByTime(500);
    expect(sources).toHaveLength(2);
    latest().emit("open");
    vi.advanceTimersByTime(NOTICE_DELAY_MS);
    expect(onNotice).not.toHaveBeenCalled();

    latest().emit("error");
    vi.advanceTimersByTime(NOTICE_DELAY_MS - 1);
    expect(noticeShown()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(noticeShown()).toBe(true);
    connection.dispose();
  });

  it("clears the notice and catches up when the stream opens again", () => {
    const { connection, latest, noticeShown, onRefresh } = setup();
    connection.start();
    latest().emit("error");
    vi.advanceTimersByTime(NOTICE_DELAY_MS);
    expect(noticeShown()).toBe(true);
    latest().emit("open");
    expect(noticeShown()).toBe(false);
    expect(onRefresh).toHaveBeenCalled();
    connection.dispose();
  });

  it("refreshes once on the second failure in a row, so an ended session reaches the login", () => {
    const { connection, latest, onRefresh } = setup();
    connection.start();
    latest().emit("error");
    expect(onRefresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    latest().emit("error");
    expect(onRefresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1_000);
    latest().emit("error");
    expect(onRefresh).toHaveBeenCalledTimes(1);
    connection.dispose();
  });

  it("shows the notice at once when going offline, even during the 2 s delay", () => {
    const { connection, latest, noticeShown, sources } = setup();
    connection.start();
    latest().emit("open");
    latest().emit("error");
    vi.advanceTimersByTime(100);
    connection.offline();
    expect(noticeShown()).toBe(true);
    expect(latest().closed).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(sources).toHaveLength(1);
    connection.dispose();
  });

  it("does not open a stream while offline, and reconnects when back online", () => {
    const { connection, sources, latest, state, noticeShown } = setup(false);
    connection.start();
    expect(sources).toHaveLength(0);
    expect(noticeShown()).toBe(true);
    state.online = true;
    connection.online();
    vi.advanceTimersByTime(0);
    expect(sources).toHaveLength(1);
    latest().emit("open");
    expect(noticeShown()).toBe(false);
    connection.dispose();
  });

  it("restarts the stream when the page becomes visible", () => {
    const { connection, sources } = setup();
    connection.start();
    sources[0].emit("open");
    connection.visible();
    vi.advanceTimersByTime(0);
    expect(sources[0].closed).toBe(true);
    expect(sources).toHaveLength(2);
    connection.dispose();
  });

  it("restarts a stream that never reopens within the watchdog time", () => {
    const { connection, sources, noticeShown } = setup();
    connection.start();
    sources[0].emit("open");
    vi.advanceTimersByTime(WATCHDOG_MS + 1);
    expect(sources[0].closed).toBe(true);
    expect(sources).toHaveLength(2);
    vi.advanceTimersByTime(NOTICE_DELAY_MS);
    expect(noticeShown()).toBe(true);
    sources[1].emit("open");
    expect(noticeShown()).toBe(false);
    connection.dispose();
  });

  it("ignores a stale source's events after a restart", () => {
    const { connection, sources, onRefresh } = setup();
    connection.start();
    const stale = sources[0];
    connection.visible();
    vi.advanceTimersByTime(1);
    expect(stale.closed).toBe(true);
    stale.emit("open");
    stale.emit("error");
    stale.emit("changed");
    vi.advanceTimersByTime(60_000);
    expect(sources[1].closed).toBe(false);
    expect(sources).toHaveLength(2);
    expect(onRefresh).not.toHaveBeenCalled();
    connection.dispose();
  });

  it("dispose closes the stream and leaves no timers", () => {
    const { connection, latest } = setup();
    connection.start();
    latest().emit("error");
    connection.dispose();
    expect(latest().closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
