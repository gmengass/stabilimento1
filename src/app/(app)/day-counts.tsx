import { getTranslations } from "next-intl/server";
import type { DayCounts as Counts, FreeOfTotal } from "@/lib/booking/counts";
import type { StockDay } from "@/lib/booking/stock";

type StockKey = "countSunbedStock" | "countDeckchairStock";

/**
 * Free / total umbrellas and sunbeds of the space shown, on the day shown (ADR 0004), and the
 * venue's sunbed and deckchair stock left that day when tracked (ADR 0021).
 */
export async function DayCounts({ counts, stock }: { counts: Counts; stock: StockDay }) {
  const t = await getTranslations("map");

  function stockLine(key: StockKey, left: FreeOfTotal | null, testId: string) {
    if (!left) return null;
    const over = left.free < 0;
    return (
      <span data-testid={testId} className={over ? "text-amber-800 dark:text-amber-300" : ""}>
        {t(key, { free: Math.max(left.free, 0), total: left.total })}
        {over && ` ${t("countOver", { count: -left.free })}`}
      </span>
    );
  }

  return (
    <section
      aria-label={t("counts")}
      data-testid="day-counts"
      className="flex flex-wrap gap-x-6 gap-y-1 text-lg font-semibold"
    >
      <span>{t("countUmbrellas", { ...counts.umbrellas })}</span>
      <span>{t("countSunbeds", { ...counts.sunbeds })}</span>
      {stockLine("countSunbedStock", stock.sunbeds, "stock-sunbeds")}
      {stockLine("countDeckchairStock", stock.deckchairs, "stock-deckchairs")}
    </section>
  );
}
