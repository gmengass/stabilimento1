// The live map's client connection (ADR 0019), without React or a real EventSource so it can
// be tested with fake timers.
import { backoffDelay } from "./refresh-scheduler";
import { STREAM_LIFETIME_MS } from "./sse";

/** The part of `EventSource` this uses. */
export interface LiveSource {
  addEventListener(type: "open" | "error" | "changed" | "resync", listener: () => void): void;
  close(): void;
}

export interface LiveConnectionOptions {
  createSource: () => LiveSource;
  isOnline: () => boolean;
  /** Asks for the page data to be reloaded (debounced by the caller). */
  onRefresh: () => void;
  onNotice: (show: boolean) => void;
  random?: () => number;
}

export interface LiveConnection {
  start(): void;
  offline(): void;
  online(): void;
  /** The page became visible again: a waking tablet may hold a dead socket. */
  visible(): void;
  dispose(): void;
}

/** Show the notice only for a real outage, not for the stream's routine 5-minute reconnect. */
export const NOTICE_DELAY_MS = 2_000;
/** The server ends every stream after its lifetime; no reopen well after that means a dead socket. */
export const WATCHDOG_MS = STREAM_LIFETIME_MS + 60_000;

export function createLiveConnection(options: LiveConnectionOptions): LiveConnection {
  const { createSource, isOnline, onRefresh, onNotice, random = Math.random } = options;
  let source: LiveSource | undefined;
  let attempt = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let notice: ReturnType<typeof setTimeout> | undefined;
  let noticeShown = false;

  const setNotice = (show: boolean) => {
    if (show !== noticeShown) onNotice(show);
    noticeShown = show;
  };
  const hideNotice = () => {
    clearTimeout(notice);
    notice = undefined;
    setNotice(false);
  };
  const showNotice = (delay: number) => {
    if (noticeShown) return;
    if (delay === 0) {
      clearTimeout(notice);
      notice = undefined;
      setNotice(true);
    } else {
      notice ??= setTimeout(() => {
        notice = undefined;
        setNotice(true);
      }, delay);
    }
  };
  const close = () => {
    source?.close();
    source = undefined;
    clearTimeout(retry);
    retry = undefined;
    clearTimeout(watchdog);
    watchdog = undefined;
  };
  const armWatchdog = () => {
    clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      showNotice(NOTICE_DELAY_MS);
      restart(0);
    }, WATCHDOG_MS);
  };
  const restart = (delay: number) => {
    close();
    retry = setTimeout(open, delay);
  };

  function open() {
    close();
    if (!isOnline()) {
      showNotice(0);
      return;
    }
    const next = createSource();
    source = next;
    armWatchdog();
    next.addEventListener("open", () => {
      if (source !== next) return;
      // Catch up on anything committed between the page render (or the outage) and now.
      onRefresh();
      attempt = 0;
      hideNotice();
      armWatchdog();
    });
    const signal = () => {
      if (source === next) onRefresh();
    };
    next.addEventListener("changed", signal);
    next.addEventListener("resync", signal);
    next.addEventListener("error", () => {
      if (source !== next) return;
      close();
      showNotice(NOTICE_DELAY_MS);
      // A stream that keeps failing may mean the session ended: a refresh sends the page to
      // the login screen in that case.
      if (attempt === 1) onRefresh();
      retry = setTimeout(open, backoffDelay(attempt, random));
      attempt += 1;
    });
  }

  return {
    start: open,
    offline() {
      close();
      showNotice(0);
    },
    online() {
      attempt = 0;
      restart(0);
    },
    visible() {
      restart(0);
    },
    dispose() {
      close();
      clearTimeout(notice);
      notice = undefined;
    },
  };
}
