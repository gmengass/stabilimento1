// Client timing for the live map (ADR 0019): a trailing debounce with a longest wait, and the
// reconnect backoff.
// A refresh that returns a promise also runs at most once at a time; Next's `router.refresh()`
// returns nothing, so there the debounce alone limits it.

export interface RefreshScheduler {
  notify(): void;
  dispose(): void;
}

export interface RefreshSchedulerOptions {
  refresh: () => Promise<void> | void;
  debounceMs?: number;
  /** A steady stream of signals still refreshes at least this often. */
  maxWaitMs?: number;
}

export function createRefreshScheduler(options: RefreshSchedulerOptions): RefreshScheduler {
  const { refresh, debounceMs = 400, maxWaitMs = 2_000 } = options;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight = false;
  let pending = false;
  let disposed = false;
  /** When the signals now waiting for a refresh began. */
  let waitingSince: number | undefined;

  const schedule = () => {
    clearTimeout(timer);
    const now = Date.now();
    waitingSince ??= now;
    const left = Math.max(0, maxWaitMs - (now - waitingSince));
    timer = setTimeout(fire, Math.min(debounceMs, left));
  };

  async function fire() {
    timer = undefined;
    waitingSince = undefined;
    if (inFlight) {
      pending = true;
      return;
    }
    inFlight = true;
    try {
      await refresh();
    } catch {
      // The next signal or reconnect refreshes again.
    } finally {
      inFlight = false;
    }
    if (pending && !disposed) {
      pending = false;
      schedule();
    }
  }

  return {
    notify() {
      if (!disposed) schedule();
    },
    dispose() {
      disposed = true;
      pending = false;
      waitingSince = undefined;
      clearTimeout(timer);
      timer = undefined;
    },
  };
}

const BACKOFF_BASE_MS = 1_000;
const BACKOFF_CAP_MS = 30_000;

/** Exponential backoff with jitter in [50%, 100%), so a restart doesn't bring every tablet back at once. */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** attempt);
  return base * (0.5 + random() / 2);
}
