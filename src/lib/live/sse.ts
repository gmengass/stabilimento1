// Server-Sent Events for the live map (ADR 0019). The stream carries only these signals, never
// booking data: the client reloads the page data itself.

export type LiveEvent = "changed" | "resync";

export const HEARTBEAT_MS = 25_000;
export const STREAM_LIFETIME_MS = 300_000;
/** Lines held for a client that isn't reading; beyond this they are dropped. */
const MAX_QUEUED = 64;

export function formatEvent(event: LiveEvent): string {
  return `event: ${event}\ndata: \n\n`;
}

/** A comment line: EventSource ignores it, but it keeps proxies and the watchdog awake. */
export function formatComment(text: string): string {
  return `: ${text}\n\n`;
}

export interface LiveStreamOptions {
  subscribe: (listener: (event: LiveEvent) => void) => () => void;
  signal: AbortSignal;
  heartbeatMs?: number;
  lifetimeMs?: number;
}

export function createLiveStream(options: LiveStreamOptions): ReadableStream<Uint8Array> {
  const {
    subscribe,
    signal,
    heartbeatMs = HEARTBEAT_MS,
    lifetimeMs = STREAM_LIFETIME_MS,
  } = options;
  const encoder = new TextEncoder();
  let stop: (() => void) | undefined;

  return new ReadableStream<Uint8Array>(
    {
      start(controller) {
        if (signal.aborted) {
          controller.close();
          return;
        }
        const write = (text: string) => {
          // A client that stopped reading gets nothing more; its stream ends with its lifetime.
          if ((controller.desiredSize ?? 0) <= 0) return;
          try {
            controller.enqueue(encoder.encode(text));
          } catch {
            stop?.();
          }
        };
        write(formatComment("connected"));
        const unsubscribe = subscribe((event) => write(formatEvent(event)));
        const heartbeat = setInterval(() => write(formatComment("ping")), heartbeatMs);
        const lifetime = setTimeout(() => {
          stop?.();
          controller.close();
        }, lifetimeMs);
        const onAbort = () => {
          stop?.();
          controller.close();
        };
        stop = () => {
          stop = undefined;
          clearInterval(heartbeat);
          clearTimeout(lifetime);
          signal.removeEventListener("abort", onAbort);
          unsubscribe();
        };
        signal.addEventListener("abort", onAbort);
      },
      cancel() {
        stop?.();
      },
    },
    new CountQueuingStrategy({ highWaterMark: MAX_QUEUED }),
  );
}
