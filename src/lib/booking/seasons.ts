import type { Kysely, Transaction } from "kysely";
import { z } from "zod";
import type { DB } from "@/db/types";
import { bookingDate } from "./bookings";

/** A season is one summer, not several years. */
export const MAX_SEASON_DAYS = 366;

export interface SeasonRow {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  /** Season passes ever sold for it, cancelled ones included: they pin the season's dates. */
  passes: number;
}

export type SeasonError =
  "invalid" | "noBeach" | "notFound" | "nameTaken" | "overlap" | "hasPasses";
export type SeasonResult = { ok: true } | { ok: false; error: SeasonError };

const fail = (error: SeasonError): SeasonResult => ({ ok: false, error });

const PG_UNIQUE_VIOLATION = "23505";
const PG_FOREIGN_KEY_VIOLATION = "23503";

function pgCode(error: unknown): string {
  return String((error as { code?: unknown } | null)?.code);
}

function daysInclusive(start: string, end: string): number {
  return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 + 1;
}

const seasonFields = z
  .object({
    name: z.string().trim().min(1).max(60),
    startDate: bookingDate,
    endDate: bookingDate,
  })
  .refine((s) => s.endDate >= s.startDate)
  .refine((s) => daysInclusive(s.startDate, s.endDate) <= MAX_SEASON_DAYS);

const seasonId = z.number().int().positive();

/** Every season of the club, newest first. */
export async function listSeasons(db: Kysely<DB>): Promise<SeasonRow[]> {
  return db
    .selectFrom("season")
    .select((eb) => [
      "season.id",
      "season.name",
      "season.start_date as startDate",
      "season.end_date as endDate",
      eb
        .selectFrom("booking")
        .select(eb.fn.countAll<number>().as("n"))
        .whereRef("booking.season_id", "=", "season.id")
        .as("passes"),
    ])
    .orderBy("season.start_date", "desc")
    .execute()
    .then((rows) => rows.map((row) => ({ ...row, passes: Number(row.passes ?? 0) })));
}

export type OpenSeason = Omit<SeasonRow, "passes">;

/** Seasons a pass can still be sold for: those that haven't ended, earliest first. */
export async function listOpenSeasons(db: Kysely<DB>, today: string): Promise<OpenSeason[]> {
  return db
    .selectFrom("season")
    .select(["id", "name", "start_date as startDate", "end_date as endDate"])
    .where("end_date", ">=", today)
    .orderBy("start_date")
    .execute();
}

type Tx = Transaction<DB>;

/**
 * Runs one season change with the venue row locked, so two admins can't create overlapping
 * seasons at the same moment.
 */
async function inVenue(
  db: Kysely<DB>,
  change: (tx: Tx, venueId: number) => Promise<SeasonResult>,
): Promise<SeasonResult> {
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
    if (pgCode(error) === PG_UNIQUE_VIOLATION) return fail("nameTaken");
    if (pgCode(error) === PG_FOREIGN_KEY_VIOLATION) return fail("hasPasses");
    throw error;
  }
}

/** True when another season of the venue shares at least one day with the range. */
async function overlaps(
  tx: Tx,
  venueId: number,
  range: { startDate: string; endDate: string },
  exceptId = 0,
): Promise<boolean> {
  const other = await tx
    .selectFrom("season")
    .select("id")
    .where("venue_id", "=", venueId)
    .where("id", "<>", exceptId)
    .where("start_date", "<=", range.endDate)
    .where("end_date", ">=", range.startDate)
    .executeTakeFirst();
  return other !== undefined;
}

/** Seasons never overlap, so any day belongs to at most one. */
export async function createSeason(db: Kysely<DB>, input: unknown): Promise<SeasonResult> {
  const parsed = seasonFields.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const season = parsed.data;
  return inVenue(db, async (tx, venueId) => {
    if (await overlaps(tx, venueId, season)) return fail("overlap");
    await tx
      .insertInto("season")
      .values({
        venue_id: venueId,
        name: season.name,
        start_date: season.startDate,
        end_date: season.endDate,
      })
      .execute();
    return { ok: true };
  });
}

const updateSchema = seasonFields.and(z.object({ seasonId }));

/**
 * Renames a season or moves its dates. Once a pass has been sold the dates are fixed: the pass
 * already holds its days.
 */
export async function updateSeason(db: Kysely<DB>, input: unknown): Promise<SeasonResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const season = parsed.data;
  return inVenue(db, async (tx, venueId) => {
    // Waits for any pass being written (it share-locks the season), then sees it.
    const current = await tx
      .selectFrom("season")
      .select(["start_date", "end_date"])
      .where("id", "=", season.seasonId)
      .where("venue_id", "=", venueId)
      .forUpdate()
      .executeTakeFirst();
    if (!current) return fail("notFound");
    const moved = current.start_date !== season.startDate || current.end_date !== season.endDate;
    if (moved) {
      const pass = await tx
        .selectFrom("booking")
        .select("id")
        .where("season_id", "=", season.seasonId)
        .limit(1)
        .executeTakeFirst();
      if (pass) return fail("hasPasses");
      if (await overlaps(tx, venueId, season, season.seasonId)) return fail("overlap");
    }
    await tx
      .updateTable("season")
      .set({ name: season.name, start_date: season.startDate, end_date: season.endDate })
      .where("id", "=", season.seasonId)
      .execute();
    return { ok: true };
  });
}

/** Removes a season no pass was ever sold for. */
export async function removeSeason(db: Kysely<DB>, input: unknown): Promise<SeasonResult> {
  const parsed = z.object({ seasonId }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  return inVenue(db, async (tx, venueId) => {
    const removed = await tx
      .deleteFrom("season")
      .where("id", "=", parsed.data.seasonId)
      .where("venue_id", "=", venueId)
      .executeTakeFirst();
    return Number(removed.numDeletedRows) > 0 ? { ok: true } : fail("notFound");
  });
}
