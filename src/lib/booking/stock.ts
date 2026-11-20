import { sql, type Kysely } from "kysely";
import type { DB } from "@/db/types";
import type { FreeOfTotal } from "./counts";

/** A beach space's stock left on one day, or null for an item that isn't tracked (ADR 0021). */
export interface StockDay {
  sunbeds: FreeOfTotal | null;
  deckchairs: FreeOfTotal | null;
}

/** A day a booking would take a stock past its number, and by how many (0 = not over). */
export interface OverStockDay {
  date: string;
  sunbeds: number;
  deckchairs: number;
}

/** Which stock a booking uses, so a booking without deckchairs isn't warned about them. */
export interface StockUse {
  sunbeds: boolean;
  deckchairs: boolean;
}

interface UseRow {
  date: string;
  sunbeds: number;
  deckchairs: number;
  sunbedStock: number | null;
  deckchairStock: number | null;
}

/**
 * Sunbeds and deckchairs in use each day from `from` to `to` in one space, with its stock. Only
 * `booked` days use stock; a booking's deckchairs count once a day however many umbrellas it has.
 */
async function loadUse(
  db: Kysely<DB>,
  areaId: number,
  from: string,
  to: string,
): Promise<UseRow[]> {
  const { rows } = await sql<UseRow>`
    with space as (
      select sunbed_stock, deckchair_stock from area where id = ${areaId}
    ), used as (
      select sd.date, bs.booking_id, sum(bs.sunbeds)::int as sunbeds
      from spot_day sd
      join booking_spot bs on bs.id = sd.booking_spot_id
      join spot s on s.id = sd.spot_id
      where sd.state = 'booked' and s.area_id = ${areaId}
        and sd.date between ${from}::date and ${to}::date
      group by sd.date, bs.booking_id
    )
    select to_char(d, 'YYYY-MM-DD') as date,
      coalesce(sum(used.sunbeds), 0)::int as sunbeds,
      coalesce(sum(b.deckchairs), 0)::int as deckchairs,
      space.sunbed_stock as "sunbedStock",
      space.deckchair_stock as "deckchairStock"
    from generate_series(${from}::date, ${to}::date, '1 day') d
    cross join space
    left join used on used.date = d
    left join booking b on b.id = used.booking_id
    group by d, space.sunbed_stock, space.deckchair_stock
    order by d
  `.execute(db);
  return rows;
}

const left = (stock: number | null, used: number): FreeOfTotal | null =>
  stock === null ? null : { free: stock - used, total: stock };

/** Free / stock of sunbeds and deckchairs on one day; free is below 0 when over the stock. */
export async function loadStockDay(
  db: Kysely<DB>,
  areaId: number,
  date: string,
): Promise<StockDay> {
  const [row] = await loadUse(db, areaId, date, date);
  if (!row) return { sunbeds: null, deckchairs: null };
  return {
    sunbeds: left(row.sunbedStock, row.sunbeds),
    deckchairs: left(row.deckchairStock, row.deckchairs),
  };
}

const over = (tracked: boolean, stock: number | null, used: number) =>
  tracked && stock !== null && used > stock ? used - stock : 0;

/**
 * Days from `from` to `to` on which a tracked stock the booking uses is past its number. Called
 * after the booking's rows are written, in the same transaction, so its own use is included.
 */
export async function overStock(
  db: Kysely<DB>,
  areaId: number,
  from: string,
  to: string,
  uses: StockUse,
): Promise<OverStockDay[]> {
  if (!uses.sunbeds && !uses.deckchairs) return [];
  const rows = await loadUse(db, areaId, from, to);
  return rows
    .map((row) => ({
      date: row.date,
      sunbeds: over(uses.sunbeds, row.sunbedStock, row.sunbeds),
      deckchairs: over(uses.deckchairs, row.deckchairStock, row.deckchairs),
    }))
    .filter((day) => day.sunbeds > 0 || day.deckchairs > 0);
}

/** The beach space a booking is in: a booking never spans two spaces (ADR 0004). */
export async function areaOfBooking(db: Kysely<DB>, bookingId: number): Promise<number> {
  const row = await db
    .selectFrom("booking_spot")
    .innerJoin("spot", "spot.id", "booking_spot.spot_id")
    .select("spot.area_id")
    .where("booking_spot.booking_id", "=", bookingId)
    .executeTakeFirstOrThrow();
  return row.area_id;
}
