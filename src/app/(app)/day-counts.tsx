import { getTranslations } from "next-intl/server";
import { DeckchairIcon, SunbedIcon, SunbedStockIcon, UmbrellaIcon } from "@/components/icons";
import type { DayCounts as Counts, FreeOfTotal } from "@/lib/booking/counts";
import type { StockDay } from "@/lib/booking/stock";

type CountKey = "countUmbrellas" | "countSunbeds" | "countSunbedStock" | "countDeckchairStock";

interface CountProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  testId: string;
  extra?: string;
  className?: string;
}

/** An icon and "free / total"; the sentence is the tooltip and what screen readers read. */
function Count({ icon, label, value, testId, extra, className = "" }: CountProps) {
  return (
    <span
      data-count
      data-testid={testId}
      title={label}
      className={`inline-flex items-center gap-1.5 ${className}`}
    >
      {icon}
      <span className="sr-only">{label}</span>
      <span aria-hidden="true">{value}</span>
      {extra && <span>{extra}</span>}
    </span>
  );
}

/**
 * Free / total umbrellas and sunbeds of the space shown, on the day shown (ADR 0004), and the
 * venue's sunbed and deckchair stock left that day when tracked (ADR 0021).
 */
export async function DayCounts({ counts, stock }: { counts: Counts; stock: StockDay }) {
  const t = await getTranslations("map");

  function stockCount(key: CountKey, left: FreeOfTotal | null, icon: React.ReactNode, id: string) {
    if (!left) return null;
    const value = { free: Math.max(left.free, 0), total: left.total };
    const over = left.free < 0;
    return (
      <Count
        icon={icon}
        label={t(key, value)}
        value={t("countValue", value)}
        testId={id}
        extra={over ? t("countOver", { count: -left.free }) : undefined}
        className={over ? "text-amber-800 dark:text-amber-300" : ""}
      />
    );
  }

  return (
    <section
      aria-label={t("counts")}
      data-testid="day-counts"
      className="flex flex-wrap gap-x-6 gap-y-1 text-lg font-semibold"
    >
      <Count
        icon={<UmbrellaIcon />}
        label={t("countUmbrellas", { ...counts.umbrellas })}
        value={t("countValue", { ...counts.umbrellas })}
        testId="count-umbrellas"
      />
      <Count
        icon={<SunbedIcon />}
        label={t("countSunbeds", { ...counts.sunbeds })}
        value={t("countValue", { ...counts.sunbeds })}
        testId="count-sunbeds"
      />
      {stockCount("countSunbedStock", stock.sunbeds, <SunbedStockIcon />, "stock-sunbeds")}
      {stockCount("countDeckchairStock", stock.deckchairs, <DeckchairIcon />, "stock-deckchairs")}
    </section>
  );
}
