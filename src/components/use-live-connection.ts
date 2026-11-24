"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createLiveConnection, type LiveSignal } from "@/lib/live/live-connection";

export interface UseLiveConnectionOptions {
  signals: readonly LiveSignal[];
  catchUpOnOpen: boolean;
  onSignal: () => void;
}

/**
 * Follows /api/live (ADR 0019, ADR 0030) while the page is open, restarting on `online` and when
 * the page becomes visible. Returns whether to show "Not live, reconnecting".
 */
export function useLiveConnection(options: UseLiveConnectionOptions): boolean {
  const router = useRouter();
  const [reconnecting, setReconnecting] = useState(false);
  const onSignal = useRef(options.onSignal);
  const { catchUpOnOpen } = options;
  const signals = options.signals.join(",");

  useEffect(() => {
    onSignal.current = options.onSignal;
  });

  useEffect(() => {
    const connection = createLiveConnection({
      createSource: () => new EventSource("/api/live"),
      isOnline: () => navigator.onLine,
      onRefresh: () => onSignal.current(),
      onSessionCheck: () => router.refresh(),
      onNotice: setReconnecting,
      signals: signals.split(",") as LiveSignal[],
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
  }, [router, signals, catchUpOnOpen]);

  return reconnecting;
}
