import type { Kysely } from "kysely";
import { z } from "zod";
import type { DB } from "@/db/types";
import { venueToday } from "@/i18n/format";
import {
  bookingDate,
  bookSpots,
  customerAndSpots,
  isConflict,
  type Clash,
  type CreateResult,
} from "./bookings";

const passSchema = z.object({
  ...customerAndSpots,
  seasonId: z.number().int().positive(),
  /** The holder's first day; the season's opening day when left out (ADR 0004). */
  startDate: bookingDate.nullish(),
});

export type CreateSeasonPassInput = z.input<typeof passSchema>;

/**
 * Sells a season pass: the spots are booked for every day from the holder's first day to the
 * season's last day, all or nothing, exactly like a day booking (ADR 0004).
 */
export async function createSeasonPass(
  db: Kysely<DB>,
  userId: string,
  input: unknown,
): Promise<CreateResult> {
  const parsed = passSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { startDate, ...pass } = parsed.data;
  const season = await db
    .selectFrom("season")
    .select(["start_date", "end_date"])
    .where("id", "=", pass.seasonId)
    .executeTakeFirst();
  if (!season) return { ok: false, error: "invalid" };
  const firstDay = startDate ?? season.start_date;
  if (firstDay < season.start_date || firstDay > season.end_date) {
    return { ok: false, error: "invalid" };
  }
  return bookSpots(db, userId, { ...pass, startDate: firstDay, endDate: season.end_date });
}

const daysSchema = z
  .object({
    bookingId: z.number().int().positive(),
    startDate: bookingDate,
    endDate: bookingDate,
  })
  .refine((d) => d.endDate >= d.startDate);

export type DaysResult =
  | { ok: true; days: number }
  | { ok: false; error: "invalid" | "notFound" | "notSeason" | "past" }
  | { ok: false; error: "taken"; clashes: Clash[] };

type Days = z.output<typeof daysSchema>;
type Change = (tx: Kysely<DB>, days: Days, bookingSpotIds: number[]) => Promise<DaysResult>;

/**
 * Runs a release or restore on an active season pass with its booking row locked, so it can't
 * interleave with a cancel or with another release of the same pass. Past days stay as they were.
 */
async function onPassDays(
  db: Kysely<DB>,
  input: unknown,
  today: string,
  change: Change,
): Promise<DaysResult> {
  const parsed = daysSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const days = parsed.data;
  if (days.startDate < today) return { ok: false, error: "past" };
  return db.transaction().execute(async (tx) => {
    const booking = await tx
      .selectFrom("booking")
      .select("kind")
      .where("id", "=", days.bookingId)
      .where("status", "=", "active")
      .forUpdate()
      .executeTakeFirst();
    if (!booking) return { ok: false, error: "notFound" } as const;
    if (booking.kind !== "season") return { ok: false, error: "notSeason" } as const;
    const bookingSpots = await tx
      .selectFrom("booking_spot")
      .select("id")
      .where("booking_id", "=", days.bookingId)
      .execute();
    return change(
      tx,
      days,
      bookingSpots.map((b) => b.id),
    );
  });
}

/** Moves the pass's days in the range from one state to the other; returns how many days moved. */
async function moveDays(
  tx: Kysely<DB>,
  days: Days,
  bookingSpotIds: number[],
  from: "booked" | "released",
  to: "booked" | "released",
): Promise<number> {
  const moved = await tx
    .updateTable("spot_day")
    .set({ state: to })
    .where("booking_spot_id", "in", bookingSpotIds)
    .where("state", "=", from)
    .where("date", ">=", days.startDate)
    .where("date", "<=", days.endDate)
    .returning("date")
    .execute();
  return new Set(moved.map((row) => row.date)).size;
}

/**
 * A season-pass holder gives days back (ADR 0004): every umbrella of the pass becomes free on
 * those days and can be sold to someone else. Days outside the pass or already released are
 * skipped; the result says how many days were released.
 */
export async function releaseDays(
  db: Kysely<DB>,
  input: unknown,
  today: string = venueToday(),
): Promise<DaysResult> {
  return onPassDays(db, input, today, async (tx, days, bookingSpotIds) => ({
    ok: true,
    days: await moveDays(tx, days, bookingSpotIds, "booked", "released"),
  }));
}

/** The pass's released days in the range that someone else has booked since. */
async function takenSince(tx: Kysely<DB>, days: Days, bookingSpotIds: number[]): Promise<Clash[]> {
  const released = await tx
    .selectFrom("spot_day")
    .select(["spot_id", "date"])
    .where("booking_spot_id", "in", bookingSpotIds)
    .where("state", "=", "released")
    .where("date", ">=", days.startDate)
    .where("date", "<=", days.endDate)
    .execute();
  const wanted = new Set(released.map((row) => `${row.spot_id}:${row.date}`));
  const spotIds = [...new Set(released.map((row) => row.spot_id))];
  const booked = await tx
    .selectFrom("spot_day")
    .innerJoin("spot", "spot.id", "spot_day.spot_id")
    .select(["spot_day.spot_id", "spot.number as spotNumber", "spot_day.date"])
    .where("spot_day.spot_id", "in", spotIds.length > 0 ? spotIds : [0])
    .where("spot_day.state", "=", "booked")
    .where("spot_day.date", ">=", days.startDate)
    .where("spot_day.date", "<=", days.endDate)
    .orderBy("spot_day.date")
    .orderBy("spot.number")
    .execute();
  return booked
    .filter((row) => wanted.has(`${row.spot_id}:${row.date}`))
    .map((row) => ({ spotNumber: row.spotNumber, date: row.date }));
}

/**
 * Takes released days back, only while every umbrella is still free on every one of them
 * (ADR 0004). If any was sold meanwhile nothing changes and the clashes come back.
 */
export async function restoreDays(
  db: Kysely<DB>,
  input: unknown,
  today: string = venueToday(),
): Promise<DaysResult> {
  try {
    return await onPassDays(db, input, today, async (tx, days, bookingSpotIds) => {
      const clashes = await takenSince(tx, days, bookingSpotIds);
      if (clashes.length > 0) return { ok: false, error: "taken", clashes };
      return { ok: true, days: await moveDays(tx, days, bookingSpotIds, "released", "booked") };
    });
  } catch (error) {
    // Someone booked one of the days between the check and the update: the unique index won.
    if (isConflict(error)) return { ok: false, error: "taken", clashes: [] };
    throw error;
  }
}
