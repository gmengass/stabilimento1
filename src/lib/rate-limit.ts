/**
 * Fixed-window counters in memory: the app runs as one process (ADR 0003), and a restart
 * forgetting the counts only gives a scraper a fresh window. Keys are namespaced by the caller.
 */
export interface Limit {
  max: number;
  windowMs: number;
}

interface Window {
  start: number;
  windowMs: number;
  count: number;
}

const globalKey = Symbol.for("stabilimento.rateLimits");
const store = globalThis as typeof globalThis & { [globalKey]?: Map<string, Window> };
const windows = (store[globalKey] ??= new Map<string, Window>());

// Bounds memory when someone sends many distinct keys (e.g. many forged addresses).
const MAX_KEYS = 10_000;

/** Address keys are the only ones an outsider can multiply; account and session keys are not. */
const isAddressKey = (key: string) => key.includes(":ip:");

function makeRoom(now: number): void {
  for (const [key, window] of windows) {
    if (now - window.start >= window.windowMs) windows.delete(key);
  }
  // Still full: drop the oldest address counts, never an account's or a session's.
  for (const key of windows.keys()) {
    if (windows.size <= MAX_KEYS * 0.9) return;
    if (isAddressKey(key)) windows.delete(key);
  }
}

/**
 * Counts one request against every key; refused if any key is over its limit. A refused
 * request still counts, so hammering doesn't reopen the window early.
 */
export function hit(keys: string[], limit: Limit, now: number = Date.now()): boolean {
  if (windows.size >= MAX_KEYS) makeRoom(now);
  let allowed = true;
  for (const key of keys) {
    const window = windows.get(key);
    if (!window || now - window.start >= limit.windowMs) {
      windows.set(key, { start: now, windowMs: limit.windowMs, count: 1 });
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

/** Tests only: how many keys are counted. */
export function countedKeys(): number {
  return windows.size;
}
