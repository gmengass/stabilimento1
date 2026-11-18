import pg from "pg";
import type { LiveEvent } from "./sse";

// One LISTEN connection per process, outside the pool, fanned out to every open stream
// (ADR 0019). Kept on globalThis so dev hot reloads don't open a second connection.

const CHANNEL = "map_changed";
const RECONNECT_MIN_MS = 500;
const RECONNECT_MAX_MS = 10_000;

interface ListenerState {
  subscribers: Set<(event: LiveEvent) => void>;
  connectionString?: string;
  client?: pg.Client;
  starting?: Promise<void>;
  retry?: ReturnType<typeof setTimeout>;
  failures: number;
  running: boolean;
}

const globalKey = Symbol.for("stabilimento.liveListener");
const store = globalThis as typeof globalThis & { [globalKey]?: ListenerState };
const state: ListenerState = (store[globalKey] ??= {
  subscribers: new Set(),
  failures: 0,
  running: false,
});

function publish(event: LiveEvent): void {
  for (const subscriber of [...state.subscribers]) {
    try {
      subscriber(event);
    } catch {
      // A stream that just closed must not stop the others.
    }
  }
}

export function subscribe(listener: (event: LiveEvent) => void): () => void {
  const entry = (event: LiveEvent) => listener(event);
  state.subscribers.add(entry);
  return () => {
    state.subscribers.delete(entry);
  };
}

export function subscriberCount(): number {
  return state.subscribers.size;
}

async function connect(isReconnect: boolean): Promise<void> {
  const client = new pg.Client({
    connectionString: state.connectionString,
    application_name: "live-listener",
  });
  const lost = () => {
    if (state.client !== client) return;
    state.client = undefined;
    client.removeAllListeners();
    client.end().catch(() => undefined);
    scheduleReconnect();
  };
  client.on("error", lost);
  client.on("end", lost);
  client.on("notification", (message) => {
    if (message.channel === CHANNEL) publish("changed");
  });
  try {
    await client.connect();
    await client.query(`LISTEN ${CHANNEL}`);
  } catch (error) {
    client.removeAllListeners();
    client.on("error", () => undefined);
    await client.end().catch(() => undefined);
    throw error;
  }
  if (!state.running) {
    client.removeAllListeners();
    await client.end().catch(() => undefined);
    return;
  }
  state.client = client;
  state.failures = 0;
  // Anything committed while we were away was missed: tell every client to catch up.
  if (isReconnect) publish("resync");
}

function scheduleReconnect(): void {
  if (!state.running || state.retry) return;
  const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * 2 ** state.failures);
  state.retry = setTimeout(() => {
    state.retry = undefined;
    if (!state.running) return;
    connect(true).catch(() => {
      state.failures += 1;
      scheduleReconnect();
    });
  }, delay);
}

/** Opens the LISTEN connection once. Safe to call on every request. */
export async function startListener(connectionString: string): Promise<void> {
  if (state.running) return state.starting;
  state.running = true;
  state.connectionString = connectionString;
  state.failures = 0;
  state.starting = connect(false).catch((error: unknown) => {
    state.failures += 1;
    scheduleReconnect();
    throw error;
  });
  return state.starting;
}

export async function stopListener(): Promise<void> {
  state.running = false;
  state.starting = undefined;
  clearTimeout(state.retry);
  state.retry = undefined;
  const client = state.client;
  state.client = undefined;
  if (!client) return;
  client.removeAllListeners();
  client.on("error", () => undefined);
  await client.end().catch(() => undefined);
}
