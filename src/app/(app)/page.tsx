import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { BeachMap } from "@/components/beach-map";
import { getDb } from "@/db/client";
import { isLocale } from "@/i18n/config";
import { addDays, formatBookingDate, isBookingDate, venueToday } from "@/i18n/format";
import { requireUser } from "@/lib/auth/session";
import { loadBeach } from "@/lib/beach/layout";

export default async function Home(props: PageProps<"/">) {
  const user = await requireUser();
  const t = await getTranslations("map");
  const locale = await getLocale();
  const { date: requested } = await props.searchParams;
  const date = isBookingDate(requested) ? requested : venueToday();
  const beach = await loadBeach(getDb());

  if (!beach) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 p-6">
        <h1 className="text-2xl font-semibold">{t("emptyTitle")}</h1>
        {user.role === "admin" ? (
          <Link href="/admin/beach" className="underline">
            {t("emptyAdmin")}
          </Link>
        ) : (
          <p>{t("emptyStaff")}</p>
        )}
      </main>
    );
  }

  return (
    <main className="flex w-full flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold">
          {formatBookingDate(date, isLocale(locale) ? locale : "it")}
        </h1>
        <Link href={`/?date=${addDays(date, -1)}`} className="rounded border px-3 py-2">
          {t("previousDay")}
        </Link>
        <Link href="/" className="rounded border px-3 py-2">
          {t("today")}
        </Link>
        <Link href={`/?date=${addDays(date, 1)}`} className="rounded border px-3 py-2">
          {t("nextDay")}
        </Link>
        <form className="flex gap-2">
          <label className="sr-only" htmlFor="map-date">
            {t("pickDate")}
          </label>
          <input
            id="map-date"
            type="date"
            name="date"
            defaultValue={date}
            className="rounded border px-2 py-2"
          />
          <button type="submit" className="rounded border px-3 py-2">
            {t("go")}
          </button>
        </form>
      </div>
      <BeachMap lines={beach.lines} />
    </main>
  );
}
