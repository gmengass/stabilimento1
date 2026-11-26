import { getTranslations } from "next-intl/server";
import { daysBetween } from "@/i18n/format";

/** Where the day being viewed sits against today: colours the date controls and the strip. */
export type DayTone = "past" | "today" | "future";

export function dayTone(date: string, today: string): DayTone {
  const offset = daysBetween(today, date);
  if (offset === 0) return "today";
  return offset < 0 ? "past" : "future";
}

/*
 * Arturo and Sera only (`sun:`; `sun:dark:` is Sera). Light and Dark keep plain outlined buttons.
 * Past days are muted sand, today is the club green, days ahead are outlined in orange (ADR 0031).
 */
const PAST =
  "sun:border-[#d9cdb4] sun:bg-[#ece4d3] sun:text-[#5a3a10] sun:dark:border-[#34495a] sun:dark:bg-[#1e2f3d] sun:dark:text-[#d9cdb4]";
const FUTURE_OUTLINE =
  "sun:border-2 sun:border-[#e8862a] sun:text-[#2a1402] sun:dark:text-[#fbf6ec]";
const FUTURE_FILLED = `${FUTURE_OUTLINE} sun:bg-[#fde7cf] sun:dark:bg-[#2a2418]`;

export const dayNavClass = {
  previous: PAST,
  today: "sun:border-[#1f3d2b] sun:bg-[#1f3d2b] sun:font-semibold sun:text-[#fbf6ec]",
  goToToday: "sun:border-[#e8862a] sun:bg-[#ffc300] sun:text-[#2a1402]",
  next: FUTURE_OUTLINE,
} as const;

/** The calendar button takes the colour of the day it shows; on today only its icon is green. */
export const calendarToneClass: Record<DayTone, string> = {
  past: PAST,
  today: "sun:[&>svg]:text-[#1f3d2b] sun:dark:[&>svg]:text-[#e8862a]",
  future: FUTURE_FILLED,
};

const STRIP: Record<Exclude<DayTone, "today">, string> = {
  past: "border-gray-500 bg-gray-100 text-gray-800 dark:border-gray-400 dark:bg-gray-800 dark:text-gray-100 sun:border-[#8a7a5c] sun:bg-[#ece4d3] sun:text-[#5a3a10] sun:dark:border-[#8fa6b6] sun:dark:bg-[#1e2f3d] sun:dark:text-[#d9cdb4]",
  future:
    "border-amber-600 bg-amber-50 text-amber-950 dark:border-amber-500 dark:bg-amber-950 dark:text-amber-50 sun:border-[#e8862a] sun:bg-[#fde7cf] sun:text-[#2a1402] sun:dark:bg-[#2a2418] sun:dark:text-[#fbf6ec]",
};

type Translate = Awaited<ReturnType<typeof getTranslations<"map">>>;

function stripText(t: Translate, tone: Exclude<DayTone, "today">, day: string, count: number) {
  if (count === 1)
    return tone === "past" ? t("viewingYesterday", { day }) : t("viewingTomorrow", { day });
  return tone === "past" ? t("viewingPast", { day, count }) : t("viewingFuture", { day, count });
}

interface StripProps {
  date: string;
  today: string;
  /** The day being viewed, in full ("mercoledì 25 nov 2026"). */
  day: string;
}

/**
 * Says which day is on the map when it isn't today, so a booking never lands on the wrong day
 * unnoticed. On today, Arturo and Sera show a thin green rule instead; Light and Dark show nothing.
 */
export async function DayStrip({ date, today, day }: StripProps) {
  const tone = dayTone(date, today);
  if (tone === "today") {
    return <div aria-hidden className="hidden h-1.5 sun:block sun:bg-[#1f3d2b]" />;
  }
  const t = await getTranslations("map");
  const count = Math.abs(daysBetween(today, date));
  return (
    <p
      data-testid="day-strip"
      data-tone={tone}
      className={`border-l-[6px] px-3 py-1.5 text-sm ${STRIP[tone]}`}
    >
      {stripText(t, tone, day, count)}
    </p>
  );
}
