import type { Kysely, Transaction } from "kysely";
import { z } from "zod";
import type { DB } from "@/db/types";
import { venueToday } from "@/i18n/format";
import { bookingDate } from "./bookings";

export interface SeasonRow {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  /** Season passes ever sold for it, cancelled ones included: they pin the season's dates. */
  passes: number;
}

export type SeasonError =
  | "invalid"
  | "noBeach"
  | "notFound"
  | "nameTaken"
  | "yearTaken"
  | "seasonOpen"
  | "seasonEnded"
  | "hasPasses";
export type SeasonResult = { ok: true } | { ok: false; error: SeasonError };

/** The club's usual season: 1 May to 30 September (month-day). Only pre-fills the form. */
const USUAL_OPENING = "05-01";
const USUAL_CLOSING = "09-30";

export interface SeasonDraft {
  year: number;
  startDate: string;
  endDate: string;
}

/**
 * The usual dates for the next season to add: the first year without a season, starting from
 * this year, or from next year once this year's usual season is over.
 */
export function nextSeasonDraft(
  seasons: Pick<SeasonRow, "startDate">[],
  today: string,
): SeasonDraft {
  const taken = new Set(seasons.map((s) => Number(s.startDate.slice(0, 4))));
  const thisYear = Number(today.slice(0, 4));
  let year = today > `${thisYear}-${USUAL_CLOSING}` ? thisYear + 1 : thisYear;
  while (taken.has(year)) year++;
  return { year, startDate: `${year}-${USUAL_OPENING}`, endDate: `${year}-${USUAL_CLOSING}` };
}

const fail = (error: SeasonError): SeasonResult => ({ ok: false, error });

const PG_UNIQUE_VIOLATION = "23505";
const PG_FOREIGN_KEY_VIOLATION = "23503";

function pgCode(error: unknown): string {
  return String((error as { code?: unknown } | null)?.code);
}

const seasonFields = z
  .object({
    name: z.string().trim().min(1).max(60),
    startDate: bookingDate,
    endDate: bookingDate,
  })
  .refine((s) => s.endDate >= s.startDate)
  // One season per calendar year: it starts and ends in the same year.
  .refine((s) => s.startDate.slice(0, 4) === s.endDate.slice(0, 4));

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

/** The season passes are sold for: the one that hasn't ended yet. There is at most one. */
export async function loadOpenSeason(db: Kysely<DB>, today: string): Promise<OpenSeason | null> {
  const season = await db
    .selectFrom("season")
    .select(["id", "name", "start_date as startDate", "end_date as endDate"])
    .where("end_date", ">=", today)
    .orderBy("start_date")
    .executeTakeFirst();
  return season ?? null;
}

type Tx = Transaction<DB>;

/** Runs one season change with the venue row locked; the unique indexes decide clashes. */
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
    if (pgCode(error) === PG_UNIQUE_VIOLATION) {
      const index = String((error as { constraint?: unknown }).constraint);
      return fail(index === "season_one_per_year" ? "yearTaken" : "nameTaken");
    }
    if (pgCode(error) === PG_FOREIGN_KEY_VIOLATION) return fail("hasPasses");
    throw error;
  }
}

/** The season that hasn't ended yet (its last day is today or later), if any. */
export function openSeason<S extends Pick<SeasonRow, "endDate">>(
  seasons: S[],
  today: string,
): S | undefined {
  return seasons.find((s) => s.endDate >= today);
}

/** True when a season other than `exceptId` hasn't ended yet. */
async function anotherIsOpen(tx: Tx, venueId: number, today: string, exceptId = 0) {
  const open = await tx
    .selectFrom("season")
    .select("id")
    .where("venue_id", "=", venueId)
    .where("id", "<>", exceptId)
    .where("end_date", ">=", today)
    .executeTakeFirst();
  return open !== undefined;
}

/**
 * One season per calendar year, so any day belongs to at most one season. The next season can
 * only be added once the current one has ended, so at most one season is ever open.
 */
export async function createSeason(
  db: Kysely<DB>,
  input: unknown,
  today: string = venueToday(),
): Promise<SeasonResult> {
  const parsed = seasonFields.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const season = parsed.data;
  return inVenue(db, async (tx, venueId) => {
    if (await anotherIsOpen(tx, venueId, today)) return fail("seasonOpen");
    if (season.endDate < today) return fail("seasonEnded");
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
export async function updateSeason(
  db: Kysely<DB>,
  input: unknown,
  today: string = venueToday(),
): Promise<SeasonResult> {
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
      const reopens = season.endDate >= today;
      if (reopens && (await anotherIsOpen(tx, venueId, today, season.seasonId))) {
        return fail("seasonOpen");
      }
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
