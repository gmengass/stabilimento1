import type { Kysely } from "kysely";
import { z } from "zod";
import type { BookingKind, DB } from "@/db/types";
import { venueToday } from "@/i18n/format";
import { movedOnly, writeEntry, type BookingState, type RecordedChange } from "./audit";
import { bookingDate, isConflict, type Clash } from "./bookings";
import { shortTime } from "./hold";

const daySchema = z.object({ bookingId: z.number().int().positive(), date: bookingDate });

const holdSchema = z.object({
  bookingId: z.number().int().positive(),
  holdUntil: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
});

type Common = "invalid" | "notFound" | "unchanged";

export type CheckInResult =
  { ok: true } | { ok: false; error: Common | "notToday" | "released" | "noShow" };
export type UncheckResult = { ok: true } | { ok: false; error: Common | "notToday" };
export type RestoreNoShowResult =
  | { ok: true }
  | { ok: false; error: Common | "notToday" }
  | { ok: false; error: "taken"; clashes: Clash[] };
export type HoldResult = { ok: true } | { ok: false; error: Common | "season" | "ended" };

interface Locked {
  kind: BookingKind;
  state: BookingState;
  holdUntil: string | null;
}

/** Locks an active booking: check-ins, the hold job and other changes to it wait in turn. */
async function lockBooking(tx: Kysely<DB>, bookingId: number): Promise<Locked | null> {
  const row = await tx
    .selectFrom("booking")
    .select(["kind", "end_date", "hold_until"])
    .where("id", "=", bookingId)
    .where("status", "=", "active")
    .forUpdate()
    .executeTakeFirst();
  if (!row) return null;
  return {
    kind: row.kind,
    state: { status: "active", endDate: row.end_date },
    holdUntil: row.hold_until === null ? null : shortTime(row.hold_until),
  };
}

/** The booking's days on one date. Read after the lock, so a no-show run that won shows here. */
function daysOn(tx: Kysely<DB>, bookingId: number, date: string) {
  return tx
    .selectFrom("spot_day")
    .innerJoin("booking_spot", "booking_spot.id", "spot_day.booking_spot_id")
    .select([
      "spot_day.booking_spot_id as bookingSpotId",
      "spot_day.spot_id as spotId",
      "spot_day.date",
      "spot_day.state",
    ])
    .where("booking_spot.booking_id", "=", bookingId)
    .where("spot_day.date", "=", date)
    .execute();
}

async function isCheckedIn(tx: Kysely<DB>, bookingId: number, date: string): Promise<boolean> {
  const row = await tx
    .selectFrom("check_in")
    .select("booking_id")
    .where("booking_id", "=", bookingId)
    .where("date", "=", date)
    .executeTakeFirst();
  return row !== undefined;
}

function insertCheckIn(tx: Kysely<DB>, bookingId: number, date: string, userId: string) {
  return tx
    .insertInto("check_in")
    .values({ booking_id: bookingId, date, checked_in_by: userId })
    .execute();
}

function checkInChange(state: BookingState, date: string, after: boolean): RecordedChange {
  return { ...movedOnly(state, []), checkIns: [{ date, before: !after, after }] };
}

type Day = z.output<typeof daySchema>;

/** Validates a today-only change and runs it on the locked booking in one transaction. */
async function onToday<R>(
  db: Kysely<DB>,
  input: unknown,
  today: string,
  run: (tx: Kysely<DB>, day: Day, booking: Locked) => Promise<R>,
): Promise<R | { ok: false; error: "invalid" | "notToday" | "notFound" }> {
  const parsed = daySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (parsed.data.date !== today) return { ok: false, error: "notToday" };
  return db.transaction().execute(async (tx) => {
    const booking = await lockBooking(tx, parsed.data.bookingId);
    if (!booking) return { ok: false, error: "notFound" } as const;
    return run(tx, parsed.data, booking);
  });
}

/**
 * Checks the booking in for today: one row covers all its umbrellas (ADR 0015). Season passes
 * may check in too, though the hold rule never flags them.
 */
export function checkIn(
  db: Kysely<DB>,
  userId: string,
  input: unknown,
  today: string = venueToday(),
): Promise<CheckInResult> {
  return onToday(db, input, today, async (tx, { bookingId, date }, booking) => {
    const days = await daysOn(tx, bookingId, date);
    if (days.length === 0) return { ok: false, error: "notFound" };
    if (!days.some((d) => d.state === "booked")) {
      return { ok: false, error: days.some((d) => d.state === "no_show") ? "noShow" : "released" };
    }
    if (await isCheckedIn(tx, bookingId, date)) return { ok: false, error: "unchanged" };
    await insertCheckIn(tx, bookingId, date, userId);
    await writeEntry(tx, {
      userId,
      action: "check_in",
      bookingId,
      detail: { date },
      change: checkInChange(booking.state, date, true),
    });
    return { ok: true };
  });
}

/** Removes today's check-in. Past the hold time, the next run of the hold job flags it. */
export function uncheck(
  db: Kysely<DB>,
  userId: string,
  input: unknown,
  today: string = venueToday(),
): Promise<UncheckResult> {
  return onToday(db, input, today, async (tx, { bookingId, date }, booking) => {
    const removed = await tx
      .deleteFrom("check_in")
      .where("booking_id", "=", bookingId)
      .where("date", "=", date)
      .executeTakeFirst();
    if (Number(removed.numDeletedRows) === 0) return { ok: false, error: "unchanged" };
    await writeEntry(tx, {
      userId,
      action: "uncheck",
      bookingId,
      detail: { date },
      change: checkInChange(booking.state, date, false),
    });
    return { ok: true };
  });
}

/** Umbrellas of these days that another booking has taken since. */
async function bookedByOthers(
  tx: Kysely<DB>,
  bookingId: number,
  spotIds: number[],
  date: string,
): Promise<Clash[]> {
  const rows = await tx
    .selectFrom("spot_day")
    .innerJoin("booking_spot", "booking_spot.id", "spot_day.booking_spot_id")
    .innerJoin("spot", "spot.id", "spot_day.spot_id")
    .select(["spot.number as spotNumber", "spot_day.date"])
    .where("spot_day.spot_id", "in", spotIds)
    .where("spot_day.date", "=", date)
    .where("spot_day.state", "=", "booked")
    .where("booking_spot.booking_id", "<>", bookingId)
    .orderBy("spot.number")
    .execute();
  return rows;
}

async function restoreIn(
  tx: Kysely<DB>,
  userId: string,
  { bookingId, date }: Day,
  booking: Locked,
): Promise<RestoreNoShowResult> {
  const noShows = (await daysOn(tx, bookingId, date)).filter((d) => d.state === "no_show");
  if (noShows.length === 0) return { ok: false, error: "unchanged" };
  const clashes = await bookedByOthers(
    tx,
    bookingId,
    noShows.map((d) => d.spotId),
    date,
  );
  if (clashes.length > 0) return { ok: false, error: "taken", clashes };
  await tx
    .updateTable("spot_day")
    .set({ state: "booked" })
    .where(
      "booking_spot_id",
      "in",
      noShows.map((d) => d.bookingSpotId),
    )
    .where("date", "=", date)
    .where("state", "=", "no_show")
    .execute();
  const wasCheckedIn = await isCheckedIn(tx, bookingId, date);
  if (!wasCheckedIn) await insertCheckIn(tx, bookingId, date, userId);
  const moved = noShows.map((d) => ({ ...d, from: "no_show" as const, to: "booked" as const }));
  await writeEntry(tx, {
    userId,
    action: "restore",
    bookingId,
    detail: { from: "no_show", date, umbrellas: noShows.length },
    change: {
      ...movedOnly(booking.state, moved),
      checkIns: wasCheckedIn ? [] : [{ date, before: false, after: true }],
    },
  });
  return { ok: true };
}

/**
 * A latecomer after all (ADR 0004): today's no-show umbrellas go back to the booking, which is
 * checked in, only if every one is still free. Otherwise nothing changes and the clashes come
 * back; staff quick-book them elsewhere.
 */
export async function restoreNoShow(
  db: Kysely<DB>,
  userId: string,
  input: unknown,
  today: string = venueToday(),
): Promise<RestoreNoShowResult> {
  try {
    return await onToday(db, input, today, (tx, day, booking) =>
      restoreIn(tx, userId, day, booking),
    );
  } catch (error) {
    // Someone booked one of the umbrellas between the check and the update: the index won.
    if (isConflict(error)) return { ok: false, error: "taken", clashes: [] };
    throw error;
  }
}

/**
 * Sets the booking's own hold time (a customer said they'll be late), or clears it to use the
 * venue's. A day already flagged stays a no-show: restore it instead.
 */
export async function setHold(
  db: Kysely<DB>,
  userId: string,
  input: unknown,
  today: string = venueToday(),
): Promise<HoldResult> {
  const parsed = holdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { bookingId, holdUntil } = parsed.data;
  return db.transaction().execute(async (tx) => {
    const booking = await lockBooking(tx, bookingId);
    if (!booking) return { ok: false, error: "notFound" } as const;
    if (booking.kind === "season") return { ok: false, error: "season" } as const;
    if (booking.state.endDate < today) return { ok: false, error: "ended" } as const;
    if (booking.holdUntil === holdUntil) return { ok: false, error: "unchanged" } as const;
    await tx
      .updateTable("booking")
      .set({ hold_until: holdUntil })
      .where("id", "=", bookingId)
      .execute();
    await writeEntry(tx, {
      userId,
      action: "hold",
      bookingId,
      detail: { holdUntil: holdUntil ?? "", previous: booking.holdUntil ?? "" },
      change: {
        ...movedOnly(booking.state, []),
        before: { ...booking.state, holdUntil: booking.holdUntil },
        after: { ...booking.state, holdUntil },
      },
    });
    return { ok: true } as const;
  });
}
