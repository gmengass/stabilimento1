/**
 * Fixed-window counters in memory: the app runs as one process (ADR 0003), and a restart
 * forgetting the counts only gives a scraper a fresh minute. Keys are namespaced by the caller.
 */
export interface Limit {
  max: number;
  windowMs: number;
}

interface Window {
  start: number;
  count: number;
}

const globalKey = Symbol.for("stabilimento.rateLimits");
const store = globalThis as typeof globalThis & { [globalKey]?: Map<string, Window> };
const windows = (store[globalKey] ??= new Map<string, Window>());

// Bounds memory if someone sends many distinct keys (e.g. forged addresses).
const MAX_KEYS = 10_000;

function forgetEnded(now: number): void {
  for (const [key, window] of windows) {
    if (now - window.start >= 60 * 60_000) windows.delete(key);
  }
}

/**
 * Counts one request against every key; refused if any key is over its limit. A refused
 * request still counts, so hammering doesn't reopen the window early.
 */
export function hit(keys: string[], limit: Limit, now: number = Date.now()): boolean {
  if (windows.size > MAX_KEYS) forgetEnded(now);
  if (windows.size > MAX_KEYS) windows.clear();
  let allowed = true;
  for (const key of keys) {
    const window = windows.get(key);
    if (!window || now - window.start >= limit.windowMs) {
      windows.set(key, { start: now, count: 1 });
      continue;
    }
    window.count += 1;
    if (window.count > limit.max) allowed = false;
  }
  return allowed;
}

/** Tests only: forget every count. */
export function resetRateLimits(): void {
  windows.clear();
}
