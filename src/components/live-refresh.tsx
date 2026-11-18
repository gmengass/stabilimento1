"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { backoffDelay, createRefreshScheduler } from "@/lib/live/refresh-scheduler";
import { STREAM_LIFETIME_MS } from "@/lib/live/sse";

/** Show the notice only for a real outage, not for the stream's routine 5-minute reconnect. */
const NOTICE_DELAY_MS = 2_000;
/** The server ends every stream after its lifetime; no reopen well after that means a dead socket. */
const WATCHDOG_MS = STREAM_LIFETIME_MS + 60_000;

/**
 * Keeps the map current (ADR 0019): listens to /api/live and refreshes the page's server data
 * on every signal, and once after each reconnect to catch up on anything missed.
 */
export function LiveRefresh() {
  const t = useTranslations("map");
  const router = useRouter();
  const [showNotice, setShowNotice] = useState(false);

  useEffect(() => {
    const scheduler = createRefreshScheduler({ refresh: () => router.refresh() });
    let source: EventSource | undefined;
    let attempt = 0;
    let everOpened = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let notice: ReturnType<typeof setTimeout> | undefined;
    let watchdog: ReturnType<typeof setTimeout> | undefined;

    const markLive = () => {
      clearTimeout(notice);
      notice = undefined;
      setShowNotice(false);
    };
    const markDown = (delay: number) => {
      if (notice !== undefined) return;
      notice = setTimeout(() => setShowNotice(true), delay);
    };
    const armWatchdog = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => restart(0), WATCHDOG_MS);
    };
    const close = () => {
      source?.close();
      source = undefined;
      clearTimeout(retry);
      retry = undefined;
      clearTimeout(watchdog);
    };

    function open() {
      close();
      if (!navigator.onLine) {
        markDown(0);
        return;
      }
      const next = new EventSource("/api/live");
      source = next;
      armWatchdog();
      next.onopen = () => {
        if (everOpened) scheduler.notify();
        everOpened = true;
        attempt = 0;
        markLive();
        armWatchdog();
      };
      next.addEventListener("changed", () => scheduler.notify());
      next.addEventListener("resync", () => scheduler.notify());
      next.onerror = () => {
        if (source !== next) return;
        close();
        markDown(NOTICE_DELAY_MS);
        // A stream that never opens may mean the session ended: a refresh sends the page to
        // the login screen in that case.
        if (attempt === 1) scheduler.notify();
        retry = setTimeout(open, backoffDelay(attempt));
        attempt += 1;
      };
    }

    function restart(delay: number) {
      close();
      retry = setTimeout(open, delay);
    }

    const onOffline = () => {
      close();
      markDown(0);
    };
    const onOnline = () => {
      attempt = 0;
      restart(0);
    };
    const onVisible = () => {
      // A tablet waking up may hold a dead socket that still looks open.
      if (document.visibilityState === "visible") restart(0);
    };

    open();
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      close();
      clearTimeout(notice);
      scheduler.dispose();
    };
  }, [router]);

  if (!showNotice) return null;
  return (
    <p
      role="status"
      data-testid="live-status"
      className="rounded border border-amber-600 bg-amber-100 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100"
    >
      {t("liveReconnecting")}
    </p>
  );
}
