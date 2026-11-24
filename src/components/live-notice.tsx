"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import type { LiveSignal } from "@/lib/live/live-connection";
import { isOwnWrite } from "@/lib/live/own-write";
import { LiveReconnecting } from "./live-reconnecting";
import { useLiveConnection } from "./use-live-connection";

export type LiveNoticeKind = "bookings" | "setup";

const SIGNALS: Record<LiveNoticeKind, readonly LiveSignal[]> = {
  bookings: ["changed"],
  setup: ["setup"],
};

/**
 * Tells a page that does not refresh itself (search, admin forms) that its data changed
 * elsewhere, and offers a reload (ADR 0030). A full reload, so forms show the saved values. A
 * signal just after this page's own save is that save, not a change from elsewhere.
 */
export function LiveNotice({ kind }: { kind: LiveNoticeKind }) {
  const t = useTranslations("live");
  const [changed, setChanged] = useState(false);
  const reconnecting = useLiveConnection({
    signals: SIGNALS[kind],
    catchUpOnOpen: false,
    sessionCheck: "probe",
    onSignal: () => {
      if (!isOwnWrite()) setChanged(true);
    },
  });

  if (changed) {
    return (
      <div
        role="status"
        data-testid="live-changed"
        className="flex flex-wrap items-center gap-3 rounded border border-amber-600 bg-amber-100 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100"
      >
        <span>{t(kind === "bookings" ? "bookingsChanged" : "setupChanged")}</span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-11 rounded border border-current px-3 py-2 font-medium"
        >
          {t("reload")}
        </button>
      </div>
    );
  }
  return reconnecting ? <LiveReconnecting /> : null;
}
