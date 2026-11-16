import type { Kysely } from "kysely";
import { z } from "zod";
import type { DB } from "@/db/types";
import { addDays, venueToday } from "@/i18n/format";
import { movedOnly, writeEntry, type MovedDay } from "./audit";
import {
  bookingDate,
  bookSpots,
  DAY_COLUMNS,
  customerAndSpots,
  isConflict,
  type Clash,
  type CreateResult,
} from "./bookings";

const passSchema = z.object({
  ...customerAndSpots,
  seasonId: z.number().int().positive(),
  /** The holder's first day, which can be later than the season's opening day (ADR 0004). */
  startDate: bookingDate,
  /** The holder's last day, if they know it. Blank or missing: the season's last day. */
  endDate: z
    .union([z.literal(""), bookingDate])
    .nullish()
    .transform((date) => date || null),
});

export type CreateSeasonPassInput = z.input<typeof passSchema>;

/**
 * Sells a season pass: the spots are booked for every day from the holder's first day to their
 * last day, all or nothing, exactly like a day booking (ADR 0004). A holder who doesn't know
 * their last day yet keeps the spots to the end of the season; `endSeasonPass` sets it later.
 * Only for a season that hasn't ended, starting no earlier than yesterday (a holder who arrived
 * yesterday), so days already over can't be sold after the fact.
 */
export async function createSeasonPass(
  db: Kysely<DB>,
  userId: string,
  input: unknown,
  today: string = venueToday(),
): Promise<CreateResult> {
  const parsed = passSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const pass = parsed.data;
  const season = await db
    .selectFrom("season")
    .select(["start_date", "end_date"])
    .where("id", "=", pass.seasonId)
    .executeTakeFirst();
  if (!season || season.end_date < today) return { ok: false, error: "invalid" };
  if (pass.startDate < addDays(today, -1)) return { ok: false, error: "invalid" };
  const endDate = pass.endDate ?? season.end_date;
  const inSeason = pass.startDate >= season.start_date && endDate <= season.end_date;
  if (!inSeason || endDate < pass.startDate) return { ok: false, error: "invalid" };
  return bookSpots(db, userId, { ...pass, endDate });
}

type PassError = "notFound" | "notSeason";

/** Locks an active season pass, so changes to it can't interleave with a cancel or each other. */
async function lockPass(
  tx: Kysely<DB>,
  bookingId: number,
): Promise<{ ok: true; startDate: string; endDate: string } | { ok: false; error: PassError }> {
  const booking = await tx
    .selectFrom("booking")
    .select(["kind", "start_date", "end_date"])
    .where("id", "=", bookingId)
    .where("status", "=", "active")
    .forUpdate()
    .executeTakeFirst();
  if (!booking) return { ok: false, error: "notFound" };
  if (booking.kind !== "season") return { ok: false, error: "notSeason" };
  return { ok: true, startDate: booking.start_date, endDate: booking.end_date };
}

const endSchema = z.object({ bookingId: z.number().int().positive(), lastDay: bookingDate });

export type EndPassResult = { ok: true } | { ok: false; error: "invalid" | "past" | PassError };

/**
 * Sets the holder's last day once they know it: the pass ends that day and every later day is
 * freed, released ones included. The last day can be yesterday (they have already left) but no
 * earlier, so days already used stay on record. A pass can only be shortened; to stay longer
 * the holder needs a new booking for the extra days.
 */
export async function endSeasonPass(
  db: Kysely<DB>,
  userId: string,
  input: unknown,
  today: string = venueToday(),
): Promise<EndPassResult> {
  const parsed = endSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { bookingId, lastDay } = parsed.data;
  if (lastDay < addDays(today, -1)) return { ok: false, error: "past" };
  return db.transaction().execute(async (tx) => {
    const pass = await lockPass(tx, bookingId);
    if (!pass.ok) return pass;
    if (lastDay < pass.startDate || lastDay > pass.endDate) {
      return { ok: false, error: "invalid" } as const;
    }
    await tx
      .updateTable("booking")
      .set({ end_date: lastDay })
      .where("id", "=", bookingId)
      .execute();
    const removed = await tx
      .deleteFrom("spot_day")
      .where("date", ">", lastDay)
      .where("booking_spot_id", "in", (q) =>
        q.selectFrom("booking_spot").select("id").where("booking_id", "=", bookingId),
      )
      .returning(DAY_COLUMNS)
      .execute();
    if (lastDay === pass.endDate) return { ok: true } as const;
    await writeEntry(tx, {
      userId,
      action: "set_last_day",
      bookingId,
      detail: { lastDay, previous: pass.endDate },
      change: {
        before: { status: "active", endDate: pass.endDate },
        after: { status: "active", endDate: lastDay },
        added: [],
        removed,
        moved: [],
      },
    });
    return { ok: true } as const;
  });
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
  | { ok: false; error: "invalid" | "past" | PassError }
  | { ok: false; error: "taken"; clashes: Clash[] };

type Days = z.output<typeof daysSchema>;
type Taken = { ok: false; error: "taken"; clashes: Clash[] };
/** Moves the pass's days, or says why it can't. */
type Move = (tx: Kysely<DB>, days: Days, bookingSpotIds: number[]) => Promise<MovedDay[] | Taken>;

/**
 * Runs a release or restore on a locked season pass and logs the days it moved in the same
 * transaction (ADR 0013). Past days stay as they were.
 */
async function onPassDays(
  db: Kysely<DB>,
  userId: string,
  action: "release" | "restore",
  input: unknown,
  today: string,
  move: Move,
): Promise<DaysResult> {
  const parsed = daysSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const days = parsed.data;
  if (days.startDate < today) return { ok: false, error: "past" };
  return db.transaction().execute(async (tx) => {
    const pass = await lockPass(tx, days.bookingId);
    if (!pass.ok) return pass;
    const bookingSpots = await tx
      .selectFrom("booking_spot")
      .select("id")
      .where("booking_id", "=", days.bookingId)
      .execute();
    const moved = await move(
      tx,
      days,
      bookingSpots.map((b) => b.id),
    );
    if (!Array.isArray(moved)) return moved;
    const count = new Set(moved.map((day) => day.date)).size;
    if (count > 0) {
      await writeEntry(tx, {
        userId,
        action,
        bookingId: days.bookingId,
        detail: { startDate: days.startDate, endDate: days.endDate, days: count },
        change: movedOnly({ status: "active", endDate: pass.endDate }, moved),
      });
    }
    return { ok: true, days: count };
  });
}

/** Moves the pass's days in the range from one state to the other. */
async function moveDays(
  tx: Kysely<DB>,
  days: Days,
  bookingSpotIds: number[],
  from: "booked" | "released",
  to: "booked" | "released",
): Promise<MovedDay[]> {
  const moved = await tx
    .updateTable("spot_day")
    .set({ state: to })
    .where("booking_spot_id", "in", bookingSpotIds)
    .where("state", "=", from)
    .where("date", ">=", days.startDate)
    .where("date", "<=", days.endDate)
    .returning(["booking_spot_id as bookingSpotId", "spot_id as spotId", "date"])
    .execute();
  return moved.map((day) => ({ ...day, from, to }));
}

/**
 * A season-pass holder gives days back (ADR 0004): every umbrella of the pass becomes free on
 * those days and can be sold to someone else. Days outside the pass or already released are
 * skipped; the result says how many days were released.
 */
export async function releaseDays(
  db: Kysely<DB>,
  userId: string,
  input: unknown,
  today: string = venueToday(),
): Promise<DaysResult> {
  return onPassDays(db, userId, "release", input, today, (tx, days, bookingSpotIds) =>
    moveDays(tx, days, bookingSpotIds, "booked", "released"),
  );
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
  userId: string,
  input: unknown,
  today: string = venueToday(),
): Promise<DaysResult> {
  try {
    return await onPassDays(db, userId, "restore", input, today, async (tx, days, ids) => {
      const clashes = await takenSince(tx, days, ids);
      if (clashes.length > 0) return { ok: false, error: "taken", clashes };
      return moveDays(tx, days, ids, "released", "booked");
    });
  } catch (error) {
    // Someone booked one of the days between the check and the update: the unique index won.
    if (isConflict(error)) return { ok: false, error: "taken", clashes: [] };
    throw error;
  }
}
