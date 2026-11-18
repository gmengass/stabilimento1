"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createLiveConnection } from "@/lib/live/live-connection";
import { createRefreshScheduler } from "@/lib/live/refresh-scheduler";

/**
 * Keeps the map current (ADR 0019): listens to /api/live and reloads the page's server data on
 * every signal, and once after each (re)connect to catch up on anything missed.
 */
export function LiveRefresh() {
  const t = useTranslations("map");
  const router = useRouter();
  const [showNotice, setShowNotice] = useState(false);

  useEffect(() => {
    const scheduler = createRefreshScheduler({ refresh: () => router.refresh() });
    const connection = createLiveConnection({
      createSource: () => new EventSource("/api/live"),
      isOnline: () => navigator.onLine,
      onRefresh: () => scheduler.notify(),
      onNotice: setShowNotice,
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
