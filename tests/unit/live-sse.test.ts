import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLiveStream,
  formatComment,
  formatEvent,
  HEARTBEAT_MS,
  STREAM_LIFETIME_MS,
  type LiveEvent,
} from "@/lib/live/sse";

const decoder = new TextDecoder();

/** A fake listener: `emit` reaches whoever subscribed, `unsubscribe` counts calls. */
function fakeSource() {
  const listeners: ((e: LiveEvent) => void)[] = [];
  const unsubscribe = vi.fn();
  const subscribe = vi.fn((fn: (e: LiveEvent) => void) => {
    listeners.push(fn);
    return unsubscribe;
  });
  const emit = (e: LiveEvent) => listeners.forEach((fn) => fn(e));
  return { subscribe, unsubscribe, emit };
}

/** Reads chunks until at least `expected` has arrived, so it doesn't depend on chunk sizes. */
async function readText(reader: ReadableStreamDefaultReader<Uint8Array>, expected: string) {
  let text = "";
  while (text.length < expected.length) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value);
  }
  return text;
}

/** Reads to the end of the stream. */
async function readAll(reader: ReadableStreamDefaultReader<Uint8Array>) {
  let text = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return text;
    text += decoder.decode(value);
  }
}

function open(heartbeatMs?: number, lifetimeMs?: number) {
  const source = fakeSource();
  const controller = new AbortController();
  const stream = createLiveStream({
    subscribe: source.subscribe,
    signal: controller.signal,
    heartbeatMs,
    lifetimeMs,
  });
  return { ...source, controller, reader: stream.getReader() };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SSE wire format", () => {
  it.each<[LiveEvent, string]>([
    ["changed", "event: changed\ndata: \n\n"],
    ["resync", "event: resync\ndata: \n\n"],
  ])("formats %s as a named event with an empty data line", (event, wire) => {
    expect(formatEvent(event)).toBe(wire);
  });

  it("formats a comment line, which EventSource ignores", () => {
    expect(formatComment("ping")).toBe(": ping\n\n");
    expect(formatComment("connected")).toBe(": connected\n\n");
  });

  it("pings every 25 s and reconnects clients every 5 min", () => {
    expect(HEARTBEAT_MS).toBe(25_000);
    expect(STREAM_LIFETIME_MS).toBe(300_000);
  });
});

describe("createLiveStream", () => {
  it("writes the connected comment before anything else and subscribes once", async () => {
    const { reader, subscribe } = open();
    expect(await readText(reader, ": connected\n\n")).toBe(": connected\n\n");
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it("forwards each event in order", async () => {
    const { reader, emit } = open();
    await readText(reader, ": connected\n\n");
    emit("changed");
    emit("resync");
    emit("changed");
    const expected = formatEvent("changed") + formatEvent("resync") + formatEvent("changed");
    expect(await readText(reader, expected)).toBe(expected);
  });

  it("pings on the default heartbeat, not before", async () => {
    const { reader, emit } = open();
    await readText(reader, ": connected\n\n");
    vi.advanceTimersByTime(HEARTBEAT_MS - 1);
    // A marker event shows nothing was written before it.
    emit("changed");
    expect(await readText(reader, formatEvent("changed"))).toBe(formatEvent("changed"));
    vi.advanceTimersByTime(1);
    expect(await readText(reader, ": ping\n\n")).toBe(": ping\n\n");
  });

  it("keeps pinging on a custom heartbeat", async () => {
    const { reader } = open(1_000, 60_000);
    await readText(reader, ": connected\n\n");
    vi.advanceTimersByTime(3_000);
    const pings = ": ping\n\n".repeat(3);
    expect(await readText(reader, pings)).toBe(pings);
  });

  it("closes after its lifetime, unsubscribes once and clears its timers", async () => {
    const { reader, unsubscribe, controller } = open(1_000, 2_500);
    vi.advanceTimersByTime(2_500);
    expect(await readAll(reader)).toBe(": connected\n\n" + ": ping\n\n".repeat(2));
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);

    controller.abort();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("closes after the default 5 minutes", async () => {
    const { reader, unsubscribe } = open();
    vi.advanceTimersByTime(STREAM_LIFETIME_MS);
    const text = await readAll(reader);
    expect(text.startsWith(": connected\n\n")).toBe(true);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("on abort, unsubscribes once and stops pinging", async () => {
    const { reader, unsubscribe, controller } = open();
    await readText(reader, ": connected\n\n");
    controller.abort();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);

    controller.abort();
    await reader.cancel().catch(() => undefined);
    vi.advanceTimersByTime(STREAM_LIFETIME_MS);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("when the client cancels the stream, unsubscribes once and clears its timers", async () => {
    const { reader, unsubscribe, controller } = open();
    await readText(reader, ": connected\n\n");
    await reader.cancel();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);

    controller.abort();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("leaks nothing for a request that was already aborted", async () => {
    const source = fakeSource();
    const controller = new AbortController();
    controller.abort();
    const stream = createLiveStream({ subscribe: source.subscribe, signal: controller.signal });
    await stream
      .getReader()
      .read()
      .catch(() => undefined);
    expect(source.unsubscribe).toHaveBeenCalledTimes(source.subscribe.mock.calls.length);
    expect(source.unsubscribe.mock.calls.length).toBeLessThanOrEqual(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
