import type { Kysely } from "kysely";
import { z } from "zod";
import type { DB } from "@/db/types";
import { LIST_DAYS, type PriceList, type PriceRow } from "./suggest";

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
