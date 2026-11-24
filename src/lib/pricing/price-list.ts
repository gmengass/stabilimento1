import { sql, type Kysely } from "kysely";
import { z } from "zod";
import type { DB } from "@/db/types";
import {
  LIST_DAYS,
  piecesOf,
  suggestPrice,
  type PriceList,
  type PriceRow,
  type Suggestion,
} from "./suggest";

/** Highest price an admin can enter for one row: €100,000 (the column allows more). */
export const MAX_PRICE_CENTS = 10_000_000;

/** One row as the admin edits it: `days` null is the season row (Stagionale). */
export interface PriceEntry extends PriceRow {
  days: number | null;
}

const emptyList = (): PriceList => ({ days: new Map(), season: null });

/** The price lists of these seasons, keyed by season id. A season with no rows has an empty list. */
export async function loadPriceLists(
  db: Kysely<DB>,
  seasonIds: number[],
): Promise<Map<number, PriceList>> {
  const lists = new Map(seasonIds.map((id) => [id, emptyList()]));
  if (seasonIds.length === 0) return lists;
  const rows = await db
    .selectFrom("price")
    .select(["season_id", "days", "single_cents", "bundle_cents"])
    .where("season_id", "in", seasonIds)
    .execute();
  for (const row of rows) {
    const list = lists.get(row.season_id);
    if (!list) continue;
    const price = { single: row.single_cents, bundle: row.bundle_cents };
    if (row.days === null) list.season = price;
    else list.days.set(row.days, price);
  }
  return lists;
}

/** A season's rows in order: 1 to 31 days, then the season row. Missing rows are left out. */
export async function listPrices(db: Kysely<DB>, seasonId: number): Promise<PriceEntry[]> {
  const list = (await loadPriceLists(db, [seasonId])).get(seasonId) ?? emptyList();
  return toEntries(list);
}

export function toEntries(list: PriceList): PriceEntry[] {
  const entries: PriceEntry[] = [];
  for (let days = 1; days <= LIST_DAYS; days++) {
    const row = list.days.get(days);
    if (row) entries.push({ days, ...row });
  }
  if (list.season) entries.push({ days: null, ...list.season });
  return entries;
}

const cents = z.number().int().min(0).max(MAX_PRICE_CENTS);

const saveSchema = z.object({
  seasonId: z.number().int().positive(),
  rows: z
    .array(
      z.object({
        days: z.number().int().min(1).max(LIST_DAYS).nullable(),
        single: cents,
        bundle: cents,
      }),
    )
    .max(LIST_DAYS + 1)
    .refine((rows) => new Set(rows.map((r) => r.days)).size === rows.length),
});

export type SavePricesResult = { ok: true } | { ok: false; error: "invalid" | "notFound" };

/** Replaces a season's price list with these rows, all at once. Rows left out are removed. */
export async function savePrices(db: Kysely<DB>, input: unknown): Promise<SavePricesResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { seasonId, rows } = parsed.data;
  return db.transaction().execute(async (tx) => {
    const season = await tx
      .selectFrom("season")
      .select("id")
      .where("id", "=", seasonId)
      .forUpdate()
      .executeTakeFirst();
    if (!season) return { ok: false, error: "notFound" } as const;
    await tx.deleteFrom("price").where("season_id", "=", seasonId).execute();
    if (rows.length > 0) {
      await tx
        .insertInto("price")
        .values(
          rows.map((r) => ({
            season_id: seasonId,
            days: r.days,
            single_cents: r.single,
            bundle_cents: r.bundle,
          })),
        )
        .execute();
    }
    return { ok: true } as const;
  });
}

export interface PriceSource {
  seasonName: string;
  entries: PriceEntry[];
}

/** The latest earlier season that has prices, to pre-fill an empty list ("copy from"). */
export async function previousPrices(
  db: Kysely<DB>,
  seasonId: number,
): Promise<PriceSource | null> {
  const row = await db
    .selectFrom("season as s")
    .innerJoin("season as this", (join) =>
      join.on("this.id", "=", seasonId).onRef("s.start_date", "<", "this.start_date"),
    )
    .select(["s.id", "s.name"])
    .where((eb) =>
      eb.exists(eb.selectFrom("price").select("id").whereRef("season_id", "=", "s.id")),
    )
    .orderBy("s.start_date", "desc")
    .limit(1)
    .executeTakeFirst();
  if (!row) return null;
  return { seasonName: row.name, entries: await listPrices(db, row.id) };
}

/** The suggested price of one booking now, as the map computes it (ADR 0029). */
export async function bookingSuggestion(
  db: Kysely<DB>,
  bookingId: number,
): Promise<Suggestion | null> {
  const row = await db
    .selectFrom("booking")
    .select((eb) => [
      "booking.deckchairs",
      eb
        .selectFrom("season")
        .select("season.id")
        .whereRef("season.start_date", "<=", "booking.start_date")
        .whereRef("season.end_date", ">=", "booking.start_date")
        .limit(1)
        .as("seasonId"),
      eb
        .selectFrom("spot_day as sd")
        .innerJoin("booking_spot as bs", "bs.id", "sd.booking_spot_id")
        .select(sql<number>`count(distinct sd.date)::int`.as("n"))
        .whereRef("bs.booking_id", "=", "booking.id")
        .where("sd.state", "<>", "released")
        .as("days"),
    ])
    .where("booking.id", "=", bookingId)
    .executeTakeFirst();
  if (!row?.seasonId) return null;
  const spots = await db
    .selectFrom("booking_spot")
    .innerJoin("spot", "spot.id", "booking_spot.spot_id")
    .select(["spot.kind", "booking_spot.sunbeds"])
    .where("booking_spot.booking_id", "=", bookingId)
    .where("booking_spot.current", "=", true)
    .execute();
  const list = (await loadPriceLists(db, [row.seasonId])).get(row.seasonId);
  if (!list) return null;
  return suggestPrice(list, piecesOf(spots, row.deckchairs), row.days ?? 0);
}

/** The id of the season that contains this day, if any. */
export async function seasonOn(db: Kysely<DB>, date: string): Promise<number | null> {
  const row = await db
    .selectFrom("season")
    .select("id")
    .where("start_date", "<=", date)
    .where("end_date", ">=", date)
    .executeTakeFirst();
  return row?.id ?? null;
}

/** A price for a booking not made yet, e.g. in quick book: its first day picks the season. */
export async function quotePrice(
  db: Kysely<DB>,
  startDate: string,
  pieces: number,
  days: number,
): Promise<Suggestion | null> {
  const seasonId = await seasonOn(db, startDate);
  if (seasonId === null) return null;
  const list = (await loadPriceLists(db, [seasonId])).get(seasonId);
  return list ? suggestPrice(list, pieces, days) : null;
}
