// Client timing for the live map (ADR 0019): a trailing debounce with at most one refresh in
// flight, and the reconnect backoff.

export interface RefreshScheduler {
  notify(): void;
  dispose(): void;
}

export interface RefreshSchedulerOptions {
  refresh: () => Promise<void> | void;
  debounceMs?: number;
}

export function createRefreshScheduler(options: RefreshSchedulerOptions): RefreshScheduler {
  const { refresh, debounceMs = 400 } = options;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight = false;
  let pending = false;
  let disposed = false;

  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(fire, debounceMs);
  };

  async function fire() {
    timer = undefined;
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
