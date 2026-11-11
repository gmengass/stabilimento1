import { sql, type Kysely, type Transaction } from "kysely";
import { z } from "zod";
import type { DB } from "@/db/types";
import { defaultSpotNumber } from "./layout";
import { MAX_LINES, MAX_SUNBEDS, MAX_UMBRELLAS_PER_LINE } from "./limits";

export type EditError =
  "invalid" | "noBeach" | "notFound" | "numberTaken" | "lineFull" | "tooManyLines" | "hasBookings";

export type EditResult = { ok: true } | { ok: false; error: EditError };

type Tx = Transaction<DB>;

const fail = (error: EditError): EditResult => ({ ok: false, error });
const done: EditResult = { ok: true };

const PG_UNIQUE_VIOLATION = "23505";
const PG_FOREIGN_KEY_VIOLATION = "23503";

function pgCode(error: unknown): string {
  return String((error as { code?: unknown } | null)?.code);
}

/**
 * Runs one layout change in a transaction with the beach locked, so two admins editing at once
 * apply their changes one after the other. Number clashes and booked umbrellas become results.
 */
async function edit(
  db: Kysely<DB>,
  change: (tx: Tx, areaId: number) => Promise<EditResult>,
): Promise<EditResult> {
  try {
    return await db.transaction().execute(async (tx) => {
      const area = await tx
        .selectFrom("area")
        .select("id")
        .orderBy("venue_id")
        .orderBy("sort_order")
        .orderBy("id")
        .forUpdate()
        .executeTakeFirst();
      if (!area) return fail("noBeach");
      return change(tx, area.id);
    });
  } catch (error) {
    if (pgCode(error) === PG_UNIQUE_VIOLATION) return fail("numberTaken");
    if (pgCode(error) === PG_FOREIGN_KEY_VIOLATION) return fail("hasBookings");
    throw error;
  }
}

const count = z.coerce.number().int().min(1).max(MAX_UMBRELLAS_PER_LINE);
const id = z.coerce.number().int().positive();

const renameSchema = z.object({ venueName: z.string().trim().min(1).max(100) });

export async function renameVenue(db: Kysely<DB>, input: unknown): Promise<EditResult> {
  const parsed = renameSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  return edit(db, async (tx, areaId) => {
    await tx
      .updateTable("venue")
      .set({ name: parsed.data.venueName })
      .where("id", "=", (q) => q.selectFrom("area").select("venue_id").where("id", "=", areaId))
      .execute();
    return done;
  });
}

/** Inserts `umbrellas` default umbrellas after the line's last position. */
async function appendUmbrellas(
  tx: Tx,
  areaId: number,
  line: { id: number; number: number },
  umbrellas: number,
): Promise<EditResult> {
  const { last } = await tx
    .selectFrom("spot")
    .select((eb) => eb.fn.coalesce(eb.fn.max("position"), sql<number>`0`).as("last"))
    .where("line_id", "=", line.id)
    .executeTakeFirstOrThrow();
  if (last + umbrellas > MAX_UMBRELLAS_PER_LINE) return fail("lineFull");
  await tx
    .insertInto("spot")
    .values(
      Array.from({ length: umbrellas }, (_, i) => ({
        area_id: areaId,
        line_id: line.id,
        position: last + i + 1,
        number: defaultSpotNumber(line.number, last + i + 1),
      })),
    )
    .execute();
  return done;
}

const addLineSchema = z.object({ umbrellas: count });

/** Adds a line behind the last one (furthest from the sea). */
export async function addLine(db: Kysely<DB>, input: unknown): Promise<EditResult> {
  const parsed = addLineSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  return edit(db, async (tx, areaId) => {
    const { last } = await tx
      .selectFrom("area_line")
      .select((eb) => eb.fn.coalesce(eb.fn.max("number"), sql<number>`0`).as("last"))
      .where("area_id", "=", areaId)
      .executeTakeFirstOrThrow();
    if (last >= MAX_LINES) return fail("tooManyLines");
    const line = await tx
      .insertInto("area_line")
      .values({ area_id: areaId, number: last + 1 })
      .returning(["id", "number"])
      .executeTakeFirstOrThrow();
    return appendUmbrellas(tx, areaId, line, parsed.data.umbrellas);
  });
}

const addUmbrellasSchema = z.object({ lineNumber: id, umbrellas: count });

/** Adds umbrellas at the right-hand end of a line (facing the sea). */
export async function addUmbrellas(db: Kysely<DB>, input: unknown): Promise<EditResult> {
  const parsed = addUmbrellasSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  return edit(db, async (tx, areaId) => {
    const line = await tx
      .selectFrom("area_line")
      .select(["id", "number"])
      .where("area_id", "=", areaId)
      .where("number", "=", parsed.data.lineNumber)
      .executeTakeFirst();
    if (!line) return fail("notFound");
    return appendUmbrellas(tx, areaId, line, parsed.data.umbrellas);
  });
}

const removeLineSchema = z.object({ lineNumber: id });

/**
 * Removes the line furthest from the sea with all its umbrellas. Refused if any of them was
 * ever booked: bookings keep their history (no cascading deletes).
 */
export async function removeLastLine(db: Kysely<DB>, input: unknown): Promise<EditResult> {
  const parsed = removeLineSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  return edit(db, async (tx, areaId) => {
    const line = await tx
      .selectFrom("area_line")
      .select(["id", "number"])
      .where("area_id", "=", areaId)
      .orderBy("number", "desc")
      .executeTakeFirst();
    if (!line || line.number !== parsed.data.lineNumber) return fail("notFound");
    await tx.deleteFrom("spot").where("line_id", "=", line.id).execute();
    await tx.deleteFrom("area_line").where("id", "=", line.id).execute();
    return done;
  });
}

const updateSpotSchema = z
  .object({
    spotId: id,
    number: z.coerce.number().int().min(1).max(99_999),
    includedSunbeds: z.coerce.number().int().min(0).max(MAX_SUNBEDS),
    maxSunbeds: z.coerce.number().int().min(1).max(MAX_SUNBEDS),
  })
  .refine((s) => s.includedSunbeds <= s.maxSunbeds);

/** Changes an umbrella's number (unique on the beach) and its sunbeds. Bookings keep theirs. */
export async function updateSpot(db: Kysely<DB>, input: unknown): Promise<EditResult> {
  const parsed = updateSpotSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const { spotId, number, includedSunbeds, maxSunbeds } = parsed.data;
  return edit(db, async (tx, areaId) => {
    const updated = await tx
      .updateTable("spot")
      .set({ number, included_sunbeds: includedSunbeds, max_sunbeds: maxSunbeds })
      .where("id", "=", spotId)
      .where("area_id", "=", areaId)
      .where("kind", "=", "umbrella")
      .returning("id")
      .executeTakeFirst();
    return updated ? done : fail("notFound");
  });
}

const removeSpotSchema = z.object({ spotId: id });

/** Removes one umbrella; the gap stays on the map. Refused if it was ever booked. */
export async function removeSpot(db: Kysely<DB>, input: unknown): Promise<EditResult> {
  const parsed = removeSpotSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  return edit(db, async (tx, areaId) => {
    const removed = await tx
      .deleteFrom("spot")
      .where("id", "=", parsed.data.spotId)
      .where("area_id", "=", areaId)
      .returning("id")
      .executeTakeFirst();
    return removed ? done : fail("notFound");
  });
}
