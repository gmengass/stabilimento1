import { sql, type Kysely, type Transaction } from "kysely";
import { z } from "zod";
import type { DB } from "@/db/types";
import { venueToday } from "@/i18n/format";
import { areaSchema, createArea, defaultSpotNumber } from "./layout";
import { MAX_AREAS, MAX_LINES, MAX_SUNBEDS, MAX_UMBRELLAS_PER_LINE } from "./limits";

export type EditError =
  | "invalid"
  | "noBeach"
  | "notFound"
  | "numberTaken"
  | "lineFull"
  | "tooManyLines"
  | "hasBookings"
  | "sunbedsInUse"
  | "lastArea"
  | "tooManyAreas";

export type EditResult = { ok: true } | { ok: false; error: EditError };

type Tx = Transaction<DB>;

const fail = (error: EditError): EditResult => ({ ok: false, error });
const done: EditResult = { ok: true };

/** A database id: positive and within Postgres `integer`. */
const id = z.coerce.number().int().positive().max(2_147_483_647);

const PG_UNIQUE_VIOLATION = "23505";
const PG_FOREIGN_KEY_VIOLATION = "23503";

function pgCode(error: unknown): string {
  return String((error as { code?: unknown } | null)?.code);
}

/**
 * Runs one layout change in a transaction with the venue row locked, so two admins editing at
 * once apply their changes one after the other. Number clashes and booked umbrellas become results.
 */
async function inVenue(
  db: Kysely<DB>,
  change: (tx: Tx, venueId: number) => Promise<EditResult>,
): Promise<EditResult> {
  try {
    return await db.transaction().execute(async (tx) => {
      const venue = await tx
        .selectFrom("venue")
        .select("id")
        .orderBy("id")
        .forUpdate()
        .executeTakeFirst();
      if (!venue) return fail("noBeach");
      return change(tx, venue.id);
    });
  } catch (error) {
    if (pgCode(error) === PG_UNIQUE_VIOLATION) return fail("numberTaken");
    if (pgCode(error) === PG_FOREIGN_KEY_VIOLATION) return fail("hasBookings");
    throw error;
  }
}

/** A change to one beach space (area) of the venue. */
async function edit(
  db: Kysely<DB>,
  areaId: number,
  change: (tx: Tx, areaId: number) => Promise<EditResult>,
): Promise<EditResult> {
  return inVenue(db, async (tx, venueId) => {
    const area = await tx
      .selectFrom("area")
      .select("id")
      .where("id", "=", areaId)
      .where("venue_id", "=", venueId)
      .executeTakeFirst();
    return area ? change(tx, area.id) : fail("notFound");
  });
}

export type AddAreaResult = { ok: true; areaId: number } | { ok: false; error: EditError };

/** Adds a beach space with its own lines and umbrellas; numbers may repeat across spaces. */
export async function addArea(db: Kysely<DB>, input: unknown): Promise<AddAreaResult> {
  const parsed = areaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  let areaId = 0;
  const result = await inVenue(db, async (tx, venueId) => {
    const { n } = await tx
      .selectFrom("area")
      .select((eb) => eb.fn.countAll<number>().as("n"))
      .where("venue_id", "=", venueId)
      .executeTakeFirstOrThrow();
    if (Number(n) >= MAX_AREAS) return fail("tooManyAreas");
    areaId = await createArea(tx, venueId, parsed.data);
    return done;
  });
  return result.ok ? { ok: true, areaId } : result;
}

const renameAreaSchema = z.object({
  areaId: id,
  areaName: z.string().trim().min(1).max(100),
});

export async function renameArea(db: Kysely<DB>, input: unknown): Promise<EditResult> {
  const parsed = renameAreaSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  return edit(db, parsed.data.areaId, async (tx, areaId) => {
    await tx
      .updateTable("area")
      .set({ name: parsed.data.areaName })
      .where("id", "=", areaId)
      .execute();
    return done;
  });
}

const removeAreaSchema = z.object({ areaId: id });

/** Removes a beach space with its lines and umbrellas. Refused if it is the last space, or if
 * any of its umbrellas was ever booked. */
export async function removeArea(db: Kysely<DB>, input: unknown): Promise<EditResult> {
  const parsed = removeAreaSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  return inVenue(db, async (tx, venueId) => {
    const areas = await tx
      .selectFrom("area")
      .select("id")
      .where("venue_id", "=", venueId)
      .execute();
    if (!areas.some((a) => a.id === parsed.data.areaId)) return fail("notFound");
    if (areas.length === 1) return fail("lastArea");
    const { areaId } = parsed.data;
    await tx.deleteFrom("spot").where("area_id", "=", areaId).execute();
    await tx.deleteFrom("area_line").where("area_id", "=", areaId).execute();
    await tx.deleteFrom("area").where("id", "=", areaId).execute();
    return done;
  });
}

const count = z.coerce.number().int().min(1).max(MAX_UMBRELLAS_PER_LINE);

const renameSchema = z.object({ venueName: z.string().trim().min(1).max(100) });

export async function renameVenue(db: Kysely<DB>, input: unknown): Promise<EditResult> {
  const parsed = renameSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  return inVenue(db, async (tx, venueId) => {
    await tx
      .updateTable("venue")
      .set({ name: parsed.data.venueName })
      .where("id", "=", venueId)
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

const addLineSchema = z.object({ areaId: id, umbrellas: count });

/** Adds a line behind the last one (furthest from the sea). */
export async function addLine(db: Kysely<DB>, input: unknown): Promise<EditResult> {
  const parsed = addLineSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  return edit(db, parsed.data.areaId, async (tx, areaId) => {
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

const addUmbrellasSchema = z.object({ areaId: id, lineNumber: id, umbrellas: count });

/** Adds umbrellas at the right-hand end of a line (facing the sea). */
export async function addUmbrellas(db: Kysely<DB>, input: unknown): Promise<EditResult> {
  const parsed = addUmbrellasSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  return edit(db, parsed.data.areaId, async (tx, areaId) => {
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

const removeLineSchema = z.object({ areaId: id, lineNumber: id });

/**
 * Removes the line furthest from the sea with all its umbrellas. Refused if any of them was
 * ever booked: bookings keep their history (no cascading deletes).
 */
export async function removeLastLine(db: Kysely<DB>, input: unknown): Promise<EditResult> {
  const parsed = removeLineSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  return edit(db, parsed.data.areaId, async (tx, areaId) => {
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
    areaId: id,
    spotId: id,
    number: z.coerce.number().int().min(1).max(99_999),
    includedSunbeds: z.coerce.number().int().min(0).max(MAX_SUNBEDS),
    maxSunbeds: z.coerce.number().int().min(1).max(MAX_SUNBEDS),
  })
  .refine((s) => s.includedSunbeds <= s.maxSunbeds);

/**
 * Changes an umbrella's number (unique on the beach) and its sunbeds. The limit can't go below
 * the sunbeds of a current or future booking on it; past bookings keep theirs.
 */
export async function updateSpot(
  db: Kysely<DB>,
  input: unknown,
  today: string = venueToday(),
): Promise<EditResult> {
  const parsed = updateSpotSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const { areaId: area, spotId, number, includedSunbeds, maxSunbeds } = parsed.data;
  return edit(db, area, async (tx, areaId) => {
    // Locks the spot first: a booking being made for it waits, then sees the new limit.
    const spot = await tx
      .selectFrom("spot")
      .select("id")
      .where("id", "=", spotId)
      .where("area_id", "=", areaId)
      .where("kind", "=", "umbrella")
      .forUpdate()
      .executeTakeFirst();
    if (!spot) return fail("notFound");
    const overLimit = await tx
      .selectFrom("booking_spot")
      .innerJoin("booking", "booking.id", "booking_spot.booking_id")
      .select("booking_spot.id")
      .where("booking_spot.spot_id", "=", spotId)
      .where("booking.status", "=", "active")
      .where("booking.end_date", ">=", today)
      .where("booking_spot.sunbeds", ">", maxSunbeds)
      .executeTakeFirst();
    if (overLimit) return fail("sunbedsInUse");
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

const removeSpotSchema = z.object({ areaId: id, spotId: id });

/** Removes one umbrella; the gap stays on the map. Refused if it was ever booked. */
export async function removeSpot(db: Kysely<DB>, input: unknown): Promise<EditResult> {
  const parsed = removeSpotSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  return edit(db, parsed.data.areaId, async (tx, areaId) => {
    const removed = await tx
      .deleteFrom("spot")
      .where("id", "=", parsed.data.spotId)
      .where("area_id", "=", areaId)
      .where("kind", "=", "umbrella")
      .returning("id")
      .executeTakeFirst();
    return removed ? done : fail("notFound");
  });
}
