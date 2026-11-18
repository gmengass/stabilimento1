import { sql, type Kysely } from "kysely";
import type { BookingKind, DB } from "@/db/types";

export const MAX_SEARCH_RESULTS = 20;
const MIN_LETTERS = 2;
const MIN_DIGITS = 3;

export type SearchQuery =
  { kind: "name"; pattern: string } | { kind: "phone"; digits: string } | { kind: "short" };

export type TodayState = "booked" | "checkedIn" | "noShow" | "released";

export interface SearchResult {
  bookingId: number;
  customerName: string;
  customerPhone: string | null;
  kind: BookingKind;
  startDate: string;
  endDate: string;
  areaId: number;
  areaName: string;
  /** Current umbrella numbers, ascending. */
  umbrellas: number[];
  /** The day to open the map on: the viewed one if the booking is there, else its next day. */
  jumpDate: string;
  /** No day left to open from today on: the map opens on today. */
  noDaysLeft: boolean;
  todayState: TodayState | null;
}

/**
 * Text with any letter searches names (ILIKE substring, wildcards escaped); otherwise the
 * digits search phones. Too little of either is `short`.
 */
export function parseQuery(raw: string): SearchQuery {
  const text = raw.trim();
  if (/\p{L}/u.test(text)) {
    const letters = text.match(/\p{L}/gu) ?? [];
    if (letters.length < MIN_LETTERS) return { kind: "short" };
    return { kind: "name", pattern: `%${text.replace(/[\\%_]/g, "\\$&")}%` };
  }
  const digits = text.replace(/\D/g, "");
  return digits.length < MIN_DIGITS ? { kind: "short" } : { kind: "phone", digits };
}

/**
 * Active bookings that haven't ended, by customer name or phone, soonest first.
 * A day to jump to is one the booking holds on the map: `booked`, or `no_show` (to restore).
 */
export async function searchBookings(
  db: Kysely<DB>,
  raw: string,
  today: string,
  viewedDate: string,
): Promise<SearchResult[]> {
  const query = parseQuery(raw);
  if (query.kind === "short") return [];
  const days = (date: string, op: "=" | ">=") =>
    sql<string | null>`(select min(sd.date)::text from spot_day sd
      join booking_spot bs on bs.id = sd.booking_spot_id
      where bs.booking_id = booking.id and sd.state in ('booked', 'no_show')
        and sd.date ${sql.raw(op)} ${date})`;
  const rows = await db
    .selectFrom("booking")
    .innerJoin(
      (eb) =>
        eb
          .selectFrom("booking_spot")
          .innerJoin("spot", "spot.id", "booking_spot.spot_id")
          .innerJoin("area", "area.id", "spot.area_id")
          .select([
            "booking_spot.booking_id",
            sql<number>`min(area.id)`.as("areaId"),
            sql<string>`min(area.name)`.as("areaName"),
            sql<number[]>`array_agg(spot.number order by spot.number)`.as("umbrellas"),
          ])
          .where("booking_spot.current", "=", true)
          .groupBy("booking_spot.booking_id")
          .as("spots"),
      (join) => join.onRef("spots.booking_id", "=", "booking.id"),
    )
    .select([
      "booking.id as bookingId",
      "booking.customer_name as customerName",
      "booking.customer_phone as customerPhone",
      "booking.kind",
      "booking.start_date as startDate",
      "booking.end_date as endDate",
      "spots.areaId",
      "spots.areaName",
      "spots.umbrellas",
      days(viewedDate, "=").as("viewedDay"),
      days(today, ">=").as("nextDay"),
      sql<TodayState | null>`(select case
          when bool_or(sd.state = 'booked') then
            case when exists (select 1 from check_in c
              where c.booking_id = booking.id and c.date = ${today}) then 'checkedIn' else 'booked' end
          when bool_or(sd.state = 'no_show') then 'noShow'
          when bool_or(sd.state = 'released') then 'released'
        end
        from spot_day sd join booking_spot bs on bs.id = sd.booking_spot_id
        where bs.booking_id = booking.id and sd.date = ${today})`.as("todayState"),
    ])
    .where("booking.status", "=", "active")
    .where("booking.end_date", ">=", today)
    .where((eb) =>
      query.kind === "name"
        ? sql<boolean>`${eb.ref("booking.customer_name")} ilike ${query.pattern} escape '\\'`
        : sql<boolean>`regexp_replace(${eb.ref("booking.customer_phone")}, '\\D', '', 'g') like ${`%${query.digits}%`}`,
    )
    .orderBy("booking.start_date")
    .orderBy("booking.id")
    .limit(MAX_SEARCH_RESULTS)
    .execute();
  return rows.map(({ viewedDay, nextDay, ...row }) => ({
    ...row,
    jumpDate: viewedDay ?? nextDay ?? today,
    noDaysLeft: !viewedDay && !nextDay,
  }));
}
