import { sql, type Kysely } from "kysely";
import { z } from "zod";
import type { DB, SpotDayState } from "@/db/types";
import { venueDayStart, venueToday } from "@/i18n/format";
import {
  mayUndo,
  writeEntry,
  type BookingState,
  type CheckInFlag,
  type DayRow,
  type MovedDay,
  type RecordedChange,
  type Viewer,
} from "./audit";
import { isConflict, type Clash } from "./bookings";
import { shortTime } from "./hold";
import { applyFlags } from "./move";
import { paidColumns, paidState } from "./paid";

const undoSchema = z.object({ entryId: z.number().int().positive() });

export type UndoResult =
  | { ok: true }
  | {
      ok: false;
      error: "invalid" | "notFound" | "forbidden" | "undone" | "changed" | "ended" | "started";
    }
  | { ok: false; error: "taken"; clashes: Clash[] };

type Day = Pick<DayRow, "bookingSpotId" | "date">;

const keyOf = (day: Day) => `${day.bookingSpotId}:${day.date}`;

/** Days before today are never touched: what was used stays on record. */
function fromToday(change: RecordedChange, today: string): RecordedChange {
  const keep = (day: { date: string }) => day.date >= today;
  return {
    ...change,
    added: change.added.filter(keep),
    removed: change.removed.filter(keep),
    moved: change.moved.filter(keep),
    checkIns: change.checkIns?.filter(keep),
  };
}

function reversed(change: RecordedChange): RecordedChange {
  return {
    before: change.after,
    after: change.before,
    added: change.removed,
    removed: change.added,
    moved: change.moved.map((day) => ({ ...day, from: day.to, to: day.from })),
    spots: change.spots?.map((flag) => ({ ...flag, before: flag.after, after: flag.before })),
    checkIns: change.checkIns?.map((flag) => ({ ...flag, before: flag.after, after: flag.before })),
  };
}

/**
 * True when the booking was moved after this entry and that move still stands. Undoing an older
 * entry would then put days back on umbrellas the booking has left: undo the move first.
 */
async function movedSince(tx: Kysely<DB>, bookingId: number, entryId: number): Promise<boolean> {
  const later = await tx
    .selectFrom("audit_log")
    .select("id")
    .where("booking_id", "=", bookingId)
    .where("action", "=", "move")
    .where("id", ">", entryId)
    .where("undone_by_id", "is", null)
    .executeTakeFirst();
  return later !== undefined;
}

/** A move that changed the dates can only be undone while neither range has started. */
function datesStarted(change: RecordedChange, today: string): boolean {
  const { before, after } = change;
  if (before.startDate === undefined || after.startDate === undefined) return false;
  const moved = before.startDate !== after.startDate || before.endDate !== after.endDate;
  return moved && (before.startDate < today || after.startDate < today);
}

/** True while the booking's umbrellas are as the change left them. */
async function spotsAsLeft(tx: Kysely<DB>, change: RecordedChange): Promise<boolean> {
  const flags = change.spots ?? [];
  if (flags.length === 0) return true;
  const rows = await tx
    .selectFrom("booking_spot")
    .select(["id", "current", "sunbeds"])
    .where(
      "id",
      "in",
      flags.map((f) => f.bookingSpotId),
    )
    .execute();
  const byId = new Map(rows.map((row) => [row.id, row]));
  return flags.every((f) => {
    const row = byId.get(f.bookingSpotId);
    return row?.current === f.after.current && row.sunbeds === f.after.sunbeds;
  });
}

/** True while the booking's days from today on are exactly as the change left them. */
async function daysAsLeft(
  tx: Kysely<DB>,
  bookingId: number,
  change: RecordedChange,
  today: string,
): Promise<boolean> {
  const rows = await tx
    .selectFrom("spot_day")
    .innerJoin("booking_spot", "booking_spot.id", "spot_day.booking_spot_id")
    .select(["spot_day.booking_spot_id as bookingSpotId", "spot_day.date", "spot_day.state"])
    .where("booking_spot.booking_id", "=", bookingId)
    .where("spot_day.date", ">=", today)
    .execute();
  const current = new Map(rows.map((row) => [keyOf(row), row.state]));
  return (
    change.added.every((day) => current.get(keyOf(day)) === day.state) &&
    change.removed.every((day) => !current.has(keyOf(day))) &&
    change.moved.every((day) => current.get(keyOf(day)) === day.to)
  );
}

/** True while the booking's check-ins on the recorded days are as the change left them. */
async function checkInsAsLeft(
  tx: Kysely<DB>,
  bookingId: number,
  flags: CheckInFlag[],
): Promise<boolean> {
  if (flags.length === 0) return true;
  const rows = await tx
    .selectFrom("check_in")
    .select("date")
    .where("booking_id", "=", bookingId)
    .where(
      "date",
      "in",
      flags.map((f) => f.date),
    )
    .execute();
  const checkedIn = new Set(rows.map((row) => row.date));
  return flags.every((f) => checkedIn.has(f.date) === f.after);
}

/**
 * A check-in may only come back while the booking still holds its umbrellas that day: once the
 * hold job flagged it, restoring the no-show is the way back (ADR 0015).
 */
async function flaggedSince(
  tx: Kysely<DB>,
  bookingId: number,
  flags: CheckInFlag[],
): Promise<boolean> {
  const dates = flags.filter((f) => f.after && !f.before).map((f) => f.date);
  if (dates.length === 0) return false;
  const row = await tx
    .selectFrom("spot_day")
    .innerJoin("booking_spot", "booking_spot.id", "spot_day.booking_spot_id")
    .select("spot_day.id")
    .where("booking_spot.booking_id", "=", bookingId)
    .where("spot_day.date", "in", dates)
    .where("spot_day.state", "<>", "booked")
    .executeTakeFirst();
  return row !== undefined;
}

/** Nothing from today on would change: the days, check-ins and booking are all left alone. */
function changesNothing(change: RecordedChange): boolean {
  return (
    change.added.length === 0 &&
    change.removed.length === 0 &&
    change.moved.length === 0 &&
    (change.spots ?? []).length === 0 &&
    (change.checkIns ?? []).length === 0 &&
    JSON.stringify(change.before) === JSON.stringify(change.after)
  );
}

async function applyCheckIns(
  tx: Kysely<DB>,
  bookingId: number,
  flags: CheckInFlag[],
  userId: string,
) {
  const add = flags.filter((f) => f.after && !f.before).map((f) => f.date);
  const remove = flags.filter((f) => f.before && !f.after).map((f) => f.date);
  if (remove.length > 0) {
    await tx
      .deleteFrom("check_in")
      .where("booking_id", "=", bookingId)
      .where("date", "in", remove)
      .execute();
  }
  if (add.length > 0) {
    await tx
      .insertInto("check_in")
      .values(add.map((date) => ({ booking_id: bookingId, date, checked_in_by: userId })))
      .execute();
  }
}

/** Umbrellas a (reversed) change would book again that someone else has booked since. */
async function takenSince(tx: Kysely<DB>, change: RecordedChange): Promise<Clash[]> {
  const rebooked = [
    ...change.added.filter((day) => day.state === "booked"),
    ...change.moved.filter((day) => day.to === "booked"),
  ];
  if (rebooked.length === 0) return [];
  const wanted = new Set(rebooked.map((day) => `${day.spotId}:${day.date}`));
  const dates = rebooked.map((day) => day.date).sort();
  const booked = await tx
    .selectFrom("spot_day")
    .innerJoin("spot", "spot.id", "spot_day.spot_id")
    .select(["spot_day.spot_id", "spot.number as spotNumber", "spot_day.date"])
    .where("spot_day.spot_id", "in", [...new Set(rebooked.map((day) => day.spotId))])
    .where("spot_day.state", "=", "booked")
    .where("spot_day.date", ">=", dates[0])
    .where("spot_day.date", "<=", dates[dates.length - 1])
    .orderBy("spot_day.date")
    .orderBy("spot.number")
    .execute();
  return booked
    .filter((row) => wanted.has(`${row.spot_id}:${row.date}`))
    .map((row) => ({ spotNumber: row.spotNumber, date: row.date }));
}

function pairs(days: Day[]) {
  return sql`select * from unnest(
    ${days.map((d) => d.bookingSpotId)}::int[], ${days.map((d) => d.date)}::date[])`;
}

async function deleteDays(tx: Kysely<DB>, days: DayRow[]) {
  if (days.length === 0) return;
  await sql`delete from spot_day where (booking_spot_id, date) in (${pairs(days)})`.execute(tx);
}

async function insertDays(tx: Kysely<DB>, days: DayRow[]) {
  if (days.length === 0) return;
  // Same fixed row order as a new booking, so two writers wait instead of deadlocking.
  await sql`
    insert into spot_day (booking_spot_id, spot_id, date, state)
    select bs, spot, d, st from unnest(
      ${days.map((d) => d.bookingSpotId)}::int[], ${days.map((d) => d.spotId)}::int[],
      ${days.map((d) => d.date)}::date[], ${days.map((d) => d.state)}::spot_day_state[]
    ) as t(bs, spot, d, st)
    order by spot, d
  `.execute(tx);
}

async function setState(tx: Kysely<DB>, days: MovedDay[], state: SpotDayState) {
  if (days.length === 0) return;
  await sql`update spot_day set state = ${state}::spot_day_state
    where (booking_spot_id, date) in (${pairs(days)})`.execute(tx);
}

async function setBooking(tx: Kysely<DB>, bookingId: number, state: BookingState, userId: string) {
  const cancelled = state.status === "cancelled";
  await tx
    .updateTable("booking")
    .set({
      status: state.status,
      end_date: state.endDate,
      ...(state.startDate !== undefined && { start_date: state.startDate }),
      ...(state.kind !== undefined && { kind: state.kind }),
      ...(state.holdUntil !== undefined && { hold_until: state.holdUntil }),
      ...(state.paid !== undefined && paidColumns(state.paid)),
      cancelled_at: cancelled ? new Date() : null,
      cancelled_by: cancelled ? userId : null,
    })
    .where("id", "=", bookingId)
    .execute();
}

/** Applies a change (already reversed) to the booking and its days. */
async function apply(tx: Kysely<DB>, bookingId: number, change: RecordedChange, userId: string) {
  await deleteDays(tx, change.removed);
  await applyFlags(tx, change.spots ?? []);
  for (const state of ["released", "no_show", "booked"] as const) {
    await setState(
      tx,
      change.moved.filter((day) => day.to === state),
      state,
    );
  }
  await applyCheckIns(tx, bookingId, change.checkIns ?? [], userId);
  await insertDays(tx, change.added);
  await setBooking(tx, bookingId, change.after, userId);
}

async function undoIn(
  tx: Kysely<DB>,
  viewer: Viewer,
  entryId: number,
  today: string,
  now: Date,
): Promise<UndoResult> {
  const entry = await tx
    .selectFrom("audit_log")
    .select(["user_id", "created_at", "booking_id", "change", "undone_by_id", "undoes_id"])
    .where("id", "=", entryId)
    .forUpdate()
    .executeTakeFirst();
  // Only today's entries can be undone (ADR 0024).
  if (!entry || new Date(entry.created_at) < venueDayStart(today))
    return { ok: false, error: "notFound" };
  const change = entry.change as RecordedChange | null;
  if (!change || entry.booking_id === null) return { ok: false, error: "invalid" };
  if (entry.undone_by_id !== null) return { ok: false, error: "undone" };
  const asEntry = { userId: entry.user_id, at: new Date(entry.created_at), undoable: true };
  if (!mayUndo({ ...asEntry, undone: false }, viewer, now))
    return { ok: false, error: "forbidden" };

  const bookingId = entry.booking_id;
  const booking = await tx
    .selectFrom("booking")
    .select([
      "status",
      "start_date",
      "end_date",
      "kind",
      "hold_until",
      "paid_at",
      "paid_by",
      "paid_suggested_cents",
    ])
    .where("id", "=", bookingId)
    .forUpdate()
    .executeTakeFirstOrThrow();
  // Nothing from today on to change: undo would only flip the status of a finished booking. A paid
  // tick is the exception: passes are paid at the end (ADR 0029).
  const lastDay = [booking.end_date, change.before.endDate, change.after.endDate].sort().at(-1);
  const paidOnly = change.after.paid !== undefined;
  if (!paidOnly && lastDay !== undefined && lastDay < today) return { ok: false, error: "ended" };
  if (datesStarted(change, today)) return { ok: false, error: "started" };
  const current = fromToday(change, today);
  const { after } = change;
  const unchanged =
    booking.status === after.status &&
    booking.end_date === after.endDate &&
    (after.startDate === undefined || booking.start_date === after.startDate) &&
    (after.kind === undefined || booking.kind === after.kind) &&
    (after.holdUntil === undefined ||
      (booking.hold_until === null ? null : shortTime(booking.hold_until)) === after.holdUntil) &&
    (after.paid === undefined ||
      JSON.stringify(paidState(booking)) === JSON.stringify(after.paid)) &&
    (await checkInsAsLeft(tx, bookingId, current.checkIns ?? [])) &&
    (await spotsAsLeft(tx, change)) &&
    (await daysAsLeft(tx, bookingId, current, today));
  if (!unchanged || (await movedSince(tx, bookingId, entryId)))
    return { ok: false, error: "changed" };

  const reverse = reversed(current);
  if (changesNothing(reverse)) return { ok: false, error: "ended" };
  if (await flaggedSince(tx, bookingId, reverse.checkIns ?? []))
    return { ok: false, error: "changed" };
  const clashes = await takenSince(tx, reverse);
  if (clashes.length > 0) return { ok: false, error: "taken", clashes };
  await apply(tx, bookingId, reverse, viewer.id);
  const undoId = await writeEntry(tx, {
    userId: viewer.id,
    action: "undo",
    bookingId,
    change: reverse,
    undoesId: entryId,
  });
  await tx
    .updateTable("audit_log")
    .set({ undone_by_id: undoId })
    .where("id", "=", entryId)
    .execute();
  // Undoing an undo puts the original change back, so the original no longer reads as undone.
  if (entry.undoes_id !== null) {
    await tx
      .updateTable("audit_log")
      .set({ undone_by_id: null })
      .where("id", "=", entry.undoes_id)
      .execute();
  }
  return { ok: true };
}

/**
 * Reverses one entry of the activity stream (ADR 0013), all or nothing. Refuses when the booking
 * changed since, when an umbrella it would book again is taken, or when the viewer may not undo
 * it. The undo is itself an entry, so it can be undone the same way.
 */
export async function undoEntry(
  db: Kysely<DB>,
  viewer: Viewer,
  input: unknown,
  today: string = venueToday(),
  now: Date = new Date(),
): Promise<UndoResult> {
  const parsed = undoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  try {
    return await db
      .transaction()
      .execute((tx) => undoIn(tx, viewer, parsed.data.entryId, today, now));
  } catch (error) {
    // Someone booked one of the umbrellas between the check and the write: the unique index won.
    if (isConflict(error)) return { ok: false, error: "taken", clashes: [] };
    throw error;
  }
}
