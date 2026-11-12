import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { AreaBanner, AreaTabs } from "@/components/area-tabs";
import { getDb } from "@/db/client";
import { isLocale } from "@/i18n/config";
import { addDays, formatBookingDate, isBookingDate, venueToday } from "@/i18n/format";
import { requireUser } from "@/lib/auth/session";
import { listAreas, loadBeach, parseAreaId } from "@/lib/beach/layout";
import { loadOccupancy } from "@/lib/booking/bookings";
import { BeachBoard } from "./beach-board";

export default async function Home(props: PageProps<"/">) {
  const user = await requireUser();
  const t = await getTranslations("map");
  const locale = await getLocale();
  const { date: requested, area } = await props.searchParams;
  const date = isBookingDate(requested) ? requested : venueToday();
  const requestedArea = parseAreaId(area);
  const beach = await loadBeach(getDb(), requestedArea);

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

  const occupancy = await loadOccupancy(getDb(), beach.areaId, date);
  const areas = await listAreas(getDb());
  const at = (day?: string) => {
    const query = new URLSearchParams({ area: String(beach.areaId) });
    if (day) query.set("date", day);
    return `/?${query}`;
  };
  // A stale link to a removed space: show the URL of the space actually shown, never mix them up.
  if (area !== undefined && beach.areaId !== requestedArea) redirect(at(date));
  const total = beach.lines.reduce((sum, line) => sum + line.spots.length, 0);
  const booked = Object.keys(occupancy).length;
  const free = total - booked;

  return (
    <main className="flex w-full flex-col gap-4 p-4">
      <AreaTabs
        areas={areas}
        currentId={beach.areaId}
        hrefOf={Object.fromEntries(areas.map((a) => [a.id, `/?area=${a.id}&date=${date}`]))}
      />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <AreaBanner name={beach.areaName} />
        <h1 className="mr-auto text-xl font-semibold">
          {formatBookingDate(date, isLocale(locale) ? locale : "it")}
        </h1>
        <Link href={at(addDays(date, -1))} className="rounded border px-3 py-2">
          {t("previousDay")}
        </Link>
        <Link href={at()} className="rounded border px-3 py-2">
          {t("today")}
        </Link>
        <Link href={at(addDays(date, 1))} className="rounded border px-3 py-2">
          {t("nextDay")}
        </Link>
        <form className="flex gap-2">
          <input type="hidden" name="area" value={beach.areaId} />
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
      <p className="flex flex-wrap gap-4 text-sm text-gray-700">
        <span>{t("legendFree", { count: free })}</span>
        <span>{t("legendBooked", { count: booked })}</span>
        <span>{t("hint")}</span>
      </p>
      <BeachBoard
        key={beach.areaId}
        areaName={beach.areaName}
        date={date}
        lines={beach.lines}
        occupancy={occupancy}
      />
    </main>
  );
}
