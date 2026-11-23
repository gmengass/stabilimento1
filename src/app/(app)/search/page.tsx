import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { BookingSearch } from "@/components/booking-search";
import { getDb } from "@/db/client";
import { isLocale } from "@/i18n/config";
import { formatBookingDate, isBookingDate, venueToday } from "@/i18n/format";
import { withinLimit } from "@/lib/auth/request-limits";
import { requireUser } from "@/lib/auth/session";
import { parseAreaId } from "@/lib/beach/layout";
import { PageMain } from "@/components/page-main";
import {
  MAX_SEARCH_RESULTS,
  parseQuery,
  searchBookings,
  type SearchResult,
} from "@/lib/booking/search";

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("search");
  return { title: t("title") };
}

export default async function Search(props: PageProps<"/search">) {
  const user = await requireUser();
  const t = await getTranslations("search");
  const locale = await getLocale();
  const params = await props.searchParams;
  const query = (first(params.q) ?? "").slice(0, 60);
  const requested = first(params.date);
  const today = venueToday();
  const date = isBookingDate(requested) ? requested : today;
  const areaId = parseAreaId(first(params.area));
  const short = parseQuery(query).kind === "short";
  // Searches return names and phones: throttled, so a lost tablet can't copy the whole list.
  const limited = !short && !(await withinLimit("search", user));
  const results = short || limited ? [] : await searchBookings(getDb(), query, today, date);
  const day = (d: string) => formatBookingDate(d, isLocale(locale) ? locale : "it");
  const mapHref = `/?${new URLSearchParams({ ...(areaId && { area: String(areaId) }), date })}`;
  const openHref = (r: SearchResult) =>
    `/?${new URLSearchParams({ area: String(r.areaId), date: r.jumpDate, booking: String(r.bookingId) })}`;

  return (
    <PageMain className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      <Link href={mapHref} className="flex min-h-11 items-center self-start underline">
        {t("back")}
      </Link>
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <BookingSearch date={date} areaId={areaId} query={query} />
      {short ? (
        <p>{t("short")}</p>
      ) : limited ? (
        <p role="alert">{t("rateLimited")}</p>
      ) : (
        <section aria-label={t("resultsFor", { query })} className="flex flex-col gap-2">
          <h2 className="font-medium">{t("resultsFor", { query })}</h2>
          {results.length === 0 && <p>{t("none")}</p>}
          <ul className="flex flex-col gap-2">
            {results.map((r) => (
              <li key={r.bookingId}>
                <Link
                  href={openHref(r)}
                  data-testid="search-result"
                  className="flex min-h-11 flex-col gap-1 rounded border p-3 hover:bg-gray-50 dark:hover:bg-gray-900"
                >
                  <span className="font-semibold">
                    {r.customerName}
                    {r.customerPhone && ` · ${r.customerPhone}`}
                  </span>
                  <span className="text-sm">
                    {t("when", {
                      kind: t("kind", { kind: r.kind }),
                      from: day(r.startDate),
                      to: day(r.endDate),
                    })}
                  </span>
                  <span className="text-sm">
                    {r.umbrellas.length === 0
                      ? r.areaName
                      : t("where", {
                          area: r.areaName,
                          umbrellas: t("umbrellas", {
                            count: r.umbrellas.length,
                            numbers: r.umbrellas.join(", "),
                          }),
                        })}
                  </span>
                  {r.todayState && (
                    <span className="text-sm">{t("state", { state: r.todayState })}</span>
                  )}
                  {r.noDaysLeft && (
                    <span className="text-sm text-amber-800 dark:text-amber-300">
                      {t("noDaysLeft")}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
          {results.length === MAX_SEARCH_RESULTS && (
            <p className="text-sm">{t("capped", { count: MAX_SEARCH_RESULTS })}</p>
          )}
        </section>
      )}
    </PageMain>
  );
}
