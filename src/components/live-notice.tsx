"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type { LiveSignal } from "@/lib/live/live-connection";
import { LiveReconnecting } from "./live-reconnecting";
import { useLiveConnection } from "./use-live-connection";

export type LiveNoticeKind = "bookings" | "setup";

const SIGNALS: Record<LiveNoticeKind, readonly LiveSignal[]> = {
  bookings: ["changed"],
  setup: ["setup"],
};

/** Signals this soon after the page itself submitted a form are taken as its own write. */
export const OWN_WRITE_MS = 10_000;

/**
 * Tells a page that does not refresh itself (search, admin forms) that its data changed
 * elsewhere, and offers a reload (ADR 0030). A full reload, so forms show the saved values. A
 * signal just after this page submitted a form is its own save, not a change from elsewhere.
 */
export function LiveNotice({ kind }: { kind: LiveNoticeKind }) {
  const t = useTranslations("live");
  const [changed, setChanged] = useState(false);
  const lastSubmit = useRef(Number.NEGATIVE_INFINITY);

  useEffect(() => {
    const onSubmit = () => {
      lastSubmit.current = Date.now();
    };
    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, []);

  const reconnecting = useLiveConnection({
    signals: SIGNALS[kind],
    catchUpOnOpen: false,
    onSignal: () => {
      if (Date.now() - lastSubmit.current > OWN_WRITE_MS) setChanged(true);
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
