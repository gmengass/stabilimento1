"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createLiveConnection, type LiveSignal } from "@/lib/live/live-connection";
import { probeSession } from "@/lib/live/session-probe";

export interface UseLiveConnectionOptions {
  signals: readonly LiveSignal[];
  catchUpOnOpen: boolean;
  onSignal: () => void;
  /**
   * When the stream keeps failing, the session may have ended. `refresh` re-renders the page;
   * `probe` only asks the auth endpoint, for pages that must not reload under the user.
   */
  sessionCheck: "refresh" | "probe";
}

/**
 * Follows /api/live (ADR 0019, ADR 0030) while the page is open, restarting on `online` and when
 * the page becomes visible. Returns whether to show "Not live, reconnecting".
 */
export function useLiveConnection(options: UseLiveConnectionOptions): boolean {
  const router = useRouter();
  const [reconnecting, setReconnecting] = useState(false);
  const onSignal = useRef(options.onSignal);
  const { catchUpOnOpen, sessionCheck } = options;
  const key = options.signals.join(",");
  // Callers pass a fresh array on every render; follow its contents, not its identity.
  const signals = useMemo(() => options.signals, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    onSignal.current = options.onSignal;
  });

  useEffect(() => {
    const connection = createLiveConnection({
      createSource: () => new EventSource("/api/live"),
      isOnline: () => navigator.onLine,
      onRefresh: () => onSignal.current(),
      onSessionCheck:
        sessionCheck === "refresh"
          ? () => router.refresh()
          : () => void probeSession({ fetch, goToLogin: () => router.push("/login") }),
      onNotice: setReconnecting,
      signals,
      catchUpOnOpen,
    });
    const onOffline = () => connection.offline();
    const onOnline = () => connection.online();
    const onVisibility = () => {
      if (document.visibilityState === "visible") connection.visible();
    };

    connection.start();
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
      connection.dispose();
    };
  }, [router, signals, catchUpOnOpen, sessionCheck]);

  return reconnecting;
}
