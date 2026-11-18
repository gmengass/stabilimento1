import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { AreaTabs } from "@/components/area-tabs";
import { BookingSearch } from "@/components/booking-search";
import { DateJump, DayText } from "@/components/date-jump";
import { getDb } from "@/db/client";
import { isLocale } from "@/i18n/config";
import {
  addDays,
  formatBookingDate,
  formatShortBookingDate,
  isBookingDate,
  venueToday,
} from "@/i18n/format";
import { requireUser } from "@/lib/auth/session";
import { listAreas, loadBeach, parseAreaId } from "@/lib/beach/layout";
import { listActivity } from "@/lib/booking/audit";
import { loadNoShows, loadOccupancy, loadReleased } from "@/lib/booking/bookings";
import { loadDayCounts } from "@/lib/booking/counts";
import { loadOpenSeason } from "@/lib/booking/seasons";
import { ActivityPanel } from "./activity-panel";
import { BeachBoard } from "./beach-board";
import { DayCounts } from "./day-counts";

export default async function Home(props: PageProps<"/">) {
  const user = await requireUser();
  const t = await getTranslations("map");
  const locale = await getLocale();
  const { date: requested, area, booking } = await props.searchParams;
  const today = venueToday();
  const date = isBookingDate(requested) ? requested : today;
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
  const released = await loadReleased(getDb(), beach.areaId, date);
  const noShows = await loadNoShows(getDb(), beach.areaId, date);
  const openSeason = await loadOpenSeason(getDb(), today);
  const areas = await listAreas(getDb());
  const activity = await listActivity(getDb());
  // From a search result: open that booking's panel, if it is on this day.
  const initialBooking =
    typeof booking === "string" && /^\d{1,9}$/.test(booking) ? Number(booking) : null;
  const at = (day?: string) => {
    const query = new URLSearchParams({ area: String(beach.areaId) });
    if (day) query.set("date", day);
    return `/?${query}`;
  };
  // A stale link to a removed space: show the URL of the space actually shown, never mix them up.
  if (area !== undefined && beach.areaId !== requestedArea) redirect(at(date));
  const dayLocale = isLocale(locale) ? locale : "it";
  const day = formatBookingDate(date, dayLocale);
  const dayLabel = {
    full: formatBookingDate(date, dayLocale, true),
    short: formatShortBookingDate(date, dayLocale),
  };
  const counts = await loadDayCounts(getDb(), beach.areaId, date);
  const occupants = Object.values(occupancy);
  const passes = occupants.filter((o) => o.kind === "season").length;
  const booked = occupants.length - passes;
  const freeReleased = Object.keys(released).filter((id) => !occupancy[Number(id)]).length;
  const checkedIn = occupants.filter((o) => o.checkedIn).length;
  const freeNoShows = Object.keys(noShows).filter((id) => !occupancy[Number(id)]).length;

  return (
    <main className="flex w-full flex-col gap-4 p-4 max-md:has-[[data-sheet=collapsed]]:pb-24 max-md:has-[[data-sheet=open]]:pb-[60dvh]">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <AreaTabs
          areas={areas}
          currentId={beach.areaId}
          hrefOf={Object.fromEntries(areas.map((a) => [a.id, `/?area=${a.id}&date=${date}`]))}
        />
        <h1 className="sr-only">{t("heading", { area: beach.areaName, date: day })}</h1>
        <nav
          aria-label={t("dateNav")}
          data-testid="date-nav"
          className="flex max-w-full shrink-0 flex-nowrap items-center gap-2 overflow-x-auto whitespace-nowrap"
        >
          <Link
            href={at(addDays(date, -1))}
            className="flex min-h-11 items-center rounded border px-3"
          >
            {t("previousDay")}
          </Link>
          {date === today ? (
            <Link href={at()} className="flex min-h-11 items-center rounded border px-3">
              <span>
                {t("todayPrefix")} <DayText label={dayLabel} />
              </span>
            </Link>
          ) : (
            <Link
              href={at()}
              data-testid="go-to-today"
              className="flex min-h-11 items-center rounded border-2 border-amber-600 bg-amber-300 px-3 font-semibold text-amber-950"
            >
              {t("goToToday")}
            </Link>
          )}
          <Link
            href={at(addDays(date, 1))}
            className="flex min-h-11 items-center rounded border px-3"
          >
            {t("nextDay")}
          </Link>
          <DateJump
            key={date}
            date={date}
            areaId={beach.areaId}
            label={date === today ? undefined : dayLabel}
          />
        </nav>
      </div>
      <BookingSearch date={date} areaId={beach.areaId} />
      <DayCounts counts={counts} />
      <p className="flex flex-wrap gap-4 text-sm text-gray-700 dark:text-gray-300">
        <span>{t("legendBooked", { count: booked })}</span>
        {passes > 0 && <span>{t("legendSeason", { count: passes })}</span>}
        {freeReleased > 0 && <span>{t("legendReleased", { count: freeReleased })}</span>}
        {checkedIn > 0 && <span>{t("legendCheckedIn", { count: checkedIn })}</span>}
        {freeNoShows > 0 && <span>{t("legendNoShow", { count: freeNoShows })}</span>}
        <span>{t("hint")}</span>
      </p>
      <BeachBoard
        today={today}
        key={`${beach.areaId}:${initialBooking ?? ""}`}
        initialBooking={initialBooking}
        areaId={beach.areaId}
        areaName={beach.areaName}
        date={date}
        lines={beach.lines}
        occupancy={occupancy}
        released={released}
        noShows={noShows}
        openSeason={openSeason}
      />
      <ActivityPanel entries={activity} viewer={{ id: user.id, role: user.role }} />
    </main>
  );
}
