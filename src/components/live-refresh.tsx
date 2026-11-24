"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { createRefreshScheduler, type RefreshScheduler } from "@/lib/live/refresh-scheduler";
import type { LiveSignal } from "@/lib/live/live-connection";
import { LiveReconnecting } from "./live-reconnecting";
import { useLiveConnection } from "./use-live-connection";

const MAP: readonly LiveSignal[] = ["changed"];

/**
 * Keeps a read-only page current (ADR 0019): reloads its server data on every signal it follows,
 * and once after each (re)connect to catch up on anything missed. The map follows `changed`.
 */
export function LiveRefresh({ signals = MAP }: { signals?: readonly LiveSignal[] }) {
  const router = useRouter();
  const scheduler = useRef<RefreshScheduler>(undefined);

  useEffect(() => {
    const next = createRefreshScheduler({ refresh: () => router.refresh() });
    scheduler.current = next;
    return () => {
      next.dispose();
      scheduler.current = undefined;
    };
  }, [router]);

  const reconnecting = useLiveConnection({
    signals,
    catchUpOnOpen: true,
    onSignal: () => scheduler.current?.notify(),
  });
  return reconnecting ? <LiveReconnecting /> : null;
}
