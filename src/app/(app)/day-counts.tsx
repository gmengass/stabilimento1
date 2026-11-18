import { getTranslations } from "next-intl/server";
import type { DayCounts as Counts } from "@/lib/booking/counts";

/** Free / total umbrellas and sunbeds of the space shown, on the day shown (ADR 0004). */
export async function DayCounts({ counts }: { counts: Counts }) {
  const t = await getTranslations("map");
  return (
    <section
      aria-label={t("counts")}
      data-testid="day-counts"
      className="flex flex-wrap gap-x-6 gap-y-1 text-lg font-semibold"
    >
      <span>{t("countUmbrellas", { ...counts.umbrellas })}</span>
      <span>{t("countSunbeds", { ...counts.sunbeds })}</span>
    </section>
  );
}
