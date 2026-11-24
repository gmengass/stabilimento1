"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useActing } from "@/components/acting";
import { defaultLocale, isLocale } from "@/i18n/config";
import { formatCents, formatTimestamp } from "@/i18n/format";
import type { Occupant } from "@/lib/booking/bookings";
import { priceChangedSincePaid, type Suggestion } from "@/lib/pricing/suggest";
import { setPaidAction } from "./booking-actions";
import { ErrorLine, type Failure } from "./booking-panel";

function useMoney() {
  const requested = useLocale();
  const locale = isLocale(requested) ? requested : defaultLocale;
  return {
    money: (cents: number) => formatCents(cents, locale),
    time: (iso: string) => formatTimestamp(new Date(iso), locale),
  };
}

/** "8 days, 4 pieces · 1 × €230,00 + 1 × €77,00": how the suggestion adds up. */
function Breakdown({ suggestion }: { suggestion: Suggestion }) {
  const t = useTranslations("prices.panel");
  const { money } = useMoney();
  const basis = t("basis", { days: suggestion.days, pieces: suggestion.pieces });
  const bundles = t("bundles", { count: suggestion.bundles, price: money(suggestion.bundleCents) });
  const singles = t("singles", { count: suggestion.singles, price: money(suggestion.singleCents) });
  const parts =
    suggestion.bundles > 0 && suggestion.singles > 0
      ? t("plus", { first: bundles, second: singles })
      : suggestion.bundles > 0
        ? bundles
        : suggestion.singles > 0
          ? singles
          : null;
  return (
    <p className="text-xs text-gray-700 dark:text-gray-300">
      {parts ? t("line", { basis, parts }) : basis}
    </p>
  );
}

/** The suggested price, its discount, and the paid tick (ADR 0029). */
export function PriceBox({ occupant }: { occupant: Occupant }) {
  const t = useTranslations("prices.panel");
  const { money, time } = useMoney();
  const { run } = useActing();
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<Failure | null>(null);
  const { suggestion, paid } = occupant.price;

  function toggle() {
    startTransition(async () => {
      try {
        const input = { bookingId: occupant.bookingId, paid: paid === null };
        const result = await run(() => setPaidAction(input));
        if (!result) return;
        // Already as wanted (another tablet got there first): the refreshed map shows it.
        if (!result.ok && result.error !== "unchanged") setFailure({ key: result.error });
        else setFailure(null);
      } catch {
        setFailure({ key: "generic" });
      }
    });
  }

  return (
    <section
      aria-label={t("title")}
      data-testid="price-box"
      className="flex flex-col gap-1 rounded border p-3"
    >
      {suggestion ? (
        <>
          <p className="flex items-baseline gap-2">
            <span className="text-sm">{t("suggested")}</span>
            <span data-testid="suggested-price" className="text-lg font-semibold tabular-nums">
              {money(suggestion.totalCents)}
            </span>
          </p>
          <Breakdown suggestion={suggestion} />
          {suggestion.discountCents > 0 && (
            <p data-testid="price-discount" className="text-sm text-green-800 dark:text-green-300">
              {t("discount", {
                amount: money(suggestion.discountCents),
                percent: suggestion.discountPercent,
              })}
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-gray-700 dark:text-gray-300">{t("noPrice")}</p>
      )}
      <label className="mt-1 flex min-h-11 items-center gap-3 text-base font-semibold">
        <input
          type="checkbox"
          checked={paid !== null}
          onChange={toggle}
          disabled={pending}
          data-testid="paid-tick"
          className="size-6"
        />
        {t("paid")}
      </label>
      {paid && (
        <p className="text-xs text-gray-700 dark:text-gray-300">
          {t("paidBy", { name: paid.byName, at: time(paid.at) })}
        </p>
      )}
      {priceChangedSincePaid(occupant.price) && (
        <p
          role="status"
          data-testid="price-changed"
          className="text-sm font-semibold text-amber-900 dark:text-amber-200"
        >
          {paid?.suggestedCents == null
            ? t("changedSincePaid")
            : t("changedSincePaidFrom", { price: money(paid.suggestedCents) })}
        </p>
      )}
      <ErrorLine failure={failure} />
    </section>
  );
}
