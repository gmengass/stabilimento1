"use client";

import { useTranslations } from "next-intl";

export function LiveReconnecting() {
  const t = useTranslations("map");
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
