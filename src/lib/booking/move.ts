import { sql, type Kysely } from "kysely";
import { z } from "zod";
import type { BookingKind, DB, SpotDayState } from "@/db/types";
import { addDays, venueToday } from "@/i18n/format";
import { writeEntry, type BookingState, type DayRow, type SpotFlag } from "./audit";
import {
  bookingDate,
  checkStock,
  DAY_COLUMNS,
  isConflict,
  MAX_BOOKING_DAYS,
  MAX_SPOTS_PER_BOOKING,
  OverStock,
  type Clash,
} from "./bookings";
import type { OverStockDay } from "./stock";

/** One umbrella of the booking and where it goes. `toSpotId` may equal `fromSpotId`. */
export interface SpotMove {
  fromSpotId: number;
  toSpotId: number;
}

export const moveSchema = z
  .object({
    bookingId: z.number().int().positive(),
    spots: z
      .array(
        z.object({
          fromSpotId: z.number().int().positive(),
          toSpotId: z.number().int().positive(),
        }),
      )
      .min(1)
      .max(MAX_SPOTS_PER_BOOKING)
      .refine((spots) => new Set(spots.map((s) => s.fromSpotId)).size === spots.length)
      .refine((spots) => new Set(spots.map((s) => s.toSpotId)).size === spots.length),
    startDate: bookingDate.optional(),
    endDate: bookingDate.optional(),
    fromDate: bookingDate.optional(),
    /** Staff saw the stock warning for the new dates and move anyway (ADR 0021). */
    allowOverStock: z.boolean().default(false),
  })
  .refine((m) => (m.startDate === undefined) === (m.endDate === undefined))
  .refine((m) => m.startDate === undefined || m.fromDate === undefined)
  .refine((m) => m.startDate === undefined || m.endDate! >= m.startDate)
  .refine(
    (m) => m.startDate === undefined || daysBetween(m.startDate, m.endDate!) < MAX_BOOKING_DAYS,
  );

export type MoveBookingInput = z.input<typeof moveSchema>;

export type MoveResult =
  | { ok: true }
  | {
      ok: false;
      error:
        "invalid" | "notFound" | "ended" | "started" | "past" | "sunbeds" | "unchanged" | "split";
    }
  | { ok: false; error: "taken"; clashes: Clash[] }
  | { ok: false; error: "stock"; days: OverStockDay[] };

function daysBetween(start: string, end: string): number {
  return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000;
}

/** A day of the booking on one umbrella, before booking_spot ids are known. */
export interface PlannedDay {
  spotId: number;
  date: string;
  state: SpotDayState;
}

export interface MovePlan {
  removed: PlannedDay[];
  added: PlannedDay[];
}

const dayKey = (day: PlannedDay) => `${day.spotId}:${day.date}:${day.state}`;

/** Every date from start to end, inclusive. */
export function datesBetween(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) dates.push(date);
  return dates;
}

/**
 * What a move changes, as days to delete and days to insert. `days` are the booking's days that
 * may change. With `dates`, every umbrella gets exactly those days, all `booked` (a booking that
 * hasn't started); without, each day keeps its date and state and goes to its new umbrella.
 * Days that end up as they were appear in neither list, so a move never clashes with itself.
 */
export function planMove(days: PlannedDay[], moves: SpotMove[], dates?: string[]): MovePlan {
  const target = new Map(moves.map((m) => [m.fromSpotId, m.toSpotId]));
  const next: PlannedDay[] = dates
    ? moves.flatMap((m) =>
        dates.map((date) => ({ spotId: m.toSpotId, date, state: "booked" as const })),
      )
    : days.map((day) => ({ ...day, spotId: target.get(day.spotId) ?? day.spotId }));
  const before = new Set(days.map(dayKey));
  const after = new Set(next.map(dayKey));
  return {
    removed: days.filter((day) => !after.has(dayKey(day))),
    added: next.filter((day) => !before.has(dayKey(day))),
  };
}

interface LockedBooking {
  kind: BookingKind;
  startDate: string;
  endDate: string;
  deckchairs: number;
}

interface BookingSpotRow {
  id: number;
  spotId: number;
  sunbeds: number;
  current: boolean;
}

type Move = z.output<typeof moveSchema>;

/** Thrown inside the transaction so nothing is written. */
class Refused extends Error {
  constructor(readonly result: Exclude<MoveResult, { ok: true }>) {
    super(result.error);
  }
}

const refuse = (result: Exclude<MoveResult, { ok: true }>): never => {
  throw new Refused(result);
};

async function lockBooking(tx: Kysely<DB>, bookingId: number): Promise<LockedBooking> {
  const booking = await tx
    .selectFrom("booking")
    .select(["kind", "start_date as startDate", "end_date as endDate", "deckchairs"])
    .where("id", "=", bookingId)
    .where("status", "=", "active")
    .forUpdate()
    .executeTakeFirst();
  return booking ?? refuse({ ok: false, error: "notFound" });
}

/** New dates for a booking that hasn't started, or null when the dates stay. */
function newDates(move: Move, booking: LockedBooking, today: string) {
  if (move.startDate === undefined || move.endDate === undefined) return null;
  if (move.startDate === booking.startDate && move.endDate === booking.endDate) return null;
  if (booking.kind === "season" || booking.startDate < today)
    refuse({ ok: false, error: "started" });
  if (move.startDate < today) refuse({ ok: false, error: "past" });
  return { startDate: move.startDate, endDate: move.endDate };
}

/** The first day a spot-only move changes: today, the booking's start, or the day asked for. */
function firstDay(move: Move, booking: LockedBooking, today: string): string {
  const from = move.fromDate ?? today;
  if (from < today) refuse({ ok: false, error: "past" });
  if (from > booking.endDate) refuse({ ok: false, error: "invalid" });
  // A day booking that hasn't started moves whole: part of it left behind would sit outside
  // its dates once they change.
  const notStarted = booking.kind !== "season" && booking.startDate >= today;
  if (notStarted && from > booking.startDate) refuse({ ok: false, error: "invalid" });
  return from > booking.startDate ? from : booking.startDate;
}

/**
 * Share-locks the targets and checks them: all in the booking's beach space, each able to hold
 * the sunbeds of the umbrella it replaces.
 */
async function checkTargets(
  tx: Kysely<DB>,
  moves: SpotMove[],
  current: BookingSpotRow[],
): Promise<void> {
  const ids = [...new Set([...current.map((b) => b.spotId), ...moves.map((m) => m.toSpotId)])];
  const spots = await tx
    .selectFrom("spot")
    .select(["id", "area_id", "max_sunbeds", "kind"])
    .where("id", "in", ids)
    .orderBy("id")
    .forShare()
    .execute();
  const byId = new Map(spots.map((s) => [s.id, s]));
  const area = byId.get(current[0].spotId)?.area_id;
  if (current.some((b) => byId.get(b.spotId)?.area_id !== area))
    refuse({ ok: false, error: "invalid" });
  const sunbedsOf = new Map(current.map((b) => [b.spotId, b.sunbeds]));
  for (const m of moves) {
    const spot = byId.get(m.toSpotId);
    if (!spot || spot.area_id !== area || spot.kind !== "umbrella")
      refuse({ ok: false, error: "invalid" });
    if ((sunbedsOf.get(m.fromSpotId) ?? 0) > spot!.max_sunbeds)
      refuse({ ok: false, error: "sunbeds" });
  }
}

/** Booked days other bookings hold on the umbrellas and days the move would book. */
async function clashesWith(tx: Kysely<DB>, bookingId: number, days: PlannedDay[]) {
  const wanted = days.filter((day) => day.state === "booked");
  if (wanted.length === 0) return [];
  const rows = await sql<Clash>`
    select s.number as "spotNumber", to_char(sd.date, 'YYYY-MM-DD') as date
    from spot_day sd
    join booking_spot bs on bs.id = sd.booking_spot_id
    join spot s on s.id = sd.spot_id
    join unnest(${wanted.map((d) => d.spotId)}::int[], ${wanted.map((d) => d.date)}::date[])
      as w(spot_id, date) on w.spot_id = sd.spot_id and w.date = sd.date
    where sd.state = 'booked' and bs.booking_id <> ${bookingId}
    order by sd.date, s.number
  `.execute(tx);
  return rows.rows;
}

/** Makes each target a current umbrella of the booking, reusing a row it had before. */
async function setSpots(
  tx: Kysely<DB>,
  bookingId: number,
  moves: SpotMove[],
  rows: BookingSpotRow[],
): Promise<{ idOf: Map<number, number>; flags: SpotFlag[] }> {
  const bySpot = new Map(rows.map((r) => [r.spotId, r]));
  const sunbedsOf = new Map(rows.filter((r) => r.current).map((r) => [r.spotId, r.sunbeds]));
  const targets = new Map(moves.map((m) => [m.toSpotId, sunbedsOf.get(m.fromSpotId) ?? 0]));
  const missing = [...targets].filter(([spotId]) => !bySpot.has(spotId));
  if (missing.length > 0) {
    const inserted = await tx
      .insertInto("booking_spot")
      .values(
        missing.map(([spotId, sunbeds]) => ({
          booking_id: bookingId,
          spot_id: spotId,
          sunbeds,
          current: false,
        })),
      )
      .returning(["id", "spot_id as spotId", "sunbeds", "current"])
      .execute();
    for (const row of inserted) bySpot.set(row.spotId, row);
  }
  const flags: SpotFlag[] = [];
  for (const row of bySpot.values()) {
    const after = targets.has(row.spotId)
      ? { current: true, sunbeds: targets.get(row.spotId)! }
      : { current: false, sunbeds: row.sunbeds };
    const isNew = missing.some(([spotId]) => spotId === row.spotId);
    const before = isNew ? { current: false, sunbeds: after.sunbeds } : row;
    if (before.current === after.current && before.sunbeds === after.sunbeds) continue;
    flags.push({
      bookingSpotId: row.id,
      before: { current: before.current, sunbeds: before.sunbeds },
      after,
    });
  }
  await applyFlags(tx, flags);
  return { idOf: new Map([...bySpot].map(([spotId, row]) => [spotId, row.id])), flags };
}

/** Sets each booking_spot's `current` and sunbeds to the flag's `after`. */
export async function applyFlags(tx: Kysely<DB>, flags: SpotFlag[]): Promise<void> {
  for (const flag of flags) {
    await tx
      .updateTable("booking_spot")
      .set({ current: flag.after.current, sunbeds: flag.after.sunbeds })
      .where("id", "=", flag.bookingSpotId)
      .execute();
  }
}

async function writeDays(tx: Kysely<DB>, removed: DayRow[], added: DayRow[]) {
  if (removed.length > 0) {
    await sql`delete from spot_day where (booking_spot_id, date) in (
      select * from unnest(${removed.map((d) => d.bookingSpotId)}::int[],
        ${removed.map((d) => d.date)}::date[]))`.execute(tx);
  }
  if (added.length === 0) return;
  // Same fixed row order as a new booking, so two writers wait instead of deadlocking.
  await sql`
    insert into spot_day (booking_spot_id, spot_id, date, state)
    select bs, spot, d, st from unnest(
      ${added.map((d) => d.bookingSpotId)}::int[], ${added.map((d) => d.spotId)}::int[],
      ${added.map((d) => d.date)}::date[], ${added.map((d) => d.state)}::spot_day_state[]
    ) as t(bs, spot, d, st)
    order by spot, d
  `.execute(tx);
}

function kindFor(startDate: string, endDate: string): BookingKind {
  return startDate === endDate ? "day" : "multi_day";
}

async function spotNumbers(tx: Kysely<DB>, ids: number[]): Promise<Map<number, number>> {
  const rows = await tx
    .selectFrom("spot")
    .select(["id", "number"])
    .where("id", "in", ids)
    .execute();
  return new Map(rows.map((r) => [r.id, r.number]));
}

/**
 * Where days still on a former umbrella go: an earlier move from a later day left them there.
 * With one umbrella they follow it; with several it isn't clear which, so the move is refused.
 * New dates replace every day, so they need nothing.
 */
function formerUmbrellas(
  moves: SpotMove[],
  current: BookingSpotRow[],
  rows: BookingSpotRow[],
  days: DayRow[],
  newDates: boolean,
): SpotMove[] {
  if (newDates) return [];
  const former = rows.filter((r) => !r.current && days.some((day) => day.bookingSpotId === r.id));
  if (former.length === 0) return [];
  if (current.length !== 1) refuse({ ok: false, error: "split" });
  return former.map((r) => ({ fromSpotId: r.spotId, toSpotId: moves[0].toSpotId }));
}

/** True when every umbrella keeps the sunbeds it has: a swap can move them between umbrellas. */
function sameSunbeds(moves: SpotMove[], current: BookingSpotRow[]): boolean {
  const sunbedsOf = new Map(current.map((r) => [r.spotId, r.sunbeds]));
  return moves.every((m) => sunbedsOf.get(m.fromSpotId) === sunbedsOf.get(m.toSpotId));
}

async function moveIn(tx: Kysely<DB>, userId: string, move: Move, today: string) {
  const booking = await lockBooking(tx, move.bookingId);
  if (booking.endDate < today) refuse({ ok: false, error: "ended" });
  const dates = newDates(move, booking, today);
  const from = dates ? booking.startDate : firstDay(move, booking, today);

  const rows = await tx
    .selectFrom("booking_spot")
    .select(["id", "spot_id as spotId", "sunbeds", "current"])
    .where("booking_id", "=", move.bookingId)
    .orderBy("id")
    .execute();
  const current = rows.filter((r) => r.current);
  const covers =
    move.spots.length === current.length &&
    move.spots.every((m) => current.some((r) => r.spotId === m.fromSpotId));
  if (!covers) refuse({ ok: false, error: "invalid" });
  await checkTargets(tx, move.spots, current);

  // Every row's days, so days an earlier move left on a former umbrella move too.
  const days = await tx
    .selectFrom("spot_day")
    .select(DAY_COLUMNS)
    .where(
      "booking_spot_id",
      "in",
      rows.map((r) => r.id),
    )
    .where("date", ">=", from)
    .execute();
  const plan = planMove(
    days,
    [...move.spots, ...formerUmbrellas(move.spots, current, rows, days, !!dates)],
    dates ? datesBetween(dates.startDate, dates.endDate) : undefined,
  );
  if (plan.removed.length === 0 && plan.added.length === 0 && sameSunbeds(move.spots, current))
    refuse({ ok: false, error: "unchanged" });
  const clashes = await clashesWith(tx, move.bookingId, plan.added);
  if (clashes.length > 0) refuse({ ok: false, error: "taken", clashes });

  const { idOf, flags } = await setSpots(tx, move.bookingId, move.spots, rows);
  const removed = days.filter((day) => plan.removed.includes(day));
  const added: DayRow[] = plan.added.map((day) => ({
    ...day,
    bookingSpotId: idOf.get(day.spotId)!,
  }));
  await writeDays(tx, removed, added);
  // Umbrellas keep their sunbeds, so only new dates can change what the booking takes from stock.
  let overStockDays = 0;
  if (dates) {
    const uses = {
      sunbeds: current.some((r) => r.sunbeds > 0),
      deckchairs: booking.deckchairs > 0,
    };
    overStockDays = await checkStock(
      tx,
      move.bookingId,
      dates.startDate,
      dates.endDate,
      uses,
      move.allowOverStock,
    );
  }

  const { kind, startDate, endDate } = booking;
  const before: BookingState = { status: "active", kind, startDate, endDate };
  const after: BookingState = dates
    ? { status: "active", ...dates, kind: kindFor(dates.startDate, dates.endDate) }
    : before;
  if (dates) {
    await tx
      .updateTable("booking")
      .set({ start_date: after.startDate, end_date: after.endDate, kind: after.kind })
      .where("id", "=", move.bookingId)
      .execute();
  }
  const numbers = await spotNumbers(tx, [
    ...move.spots.map((m) => m.fromSpotId),
    ...move.spots.map((m) => m.toSpotId),
  ]);
  const list = (ids: number[]) => ids.map((id) => numbers.get(id)).join(", ");
  await writeEntry(tx, {
    userId,
    action: "move",
    bookingId: move.bookingId,
    detail: {
      fromSpots: list(move.spots.map((m) => m.fromSpotId)),
      toSpots: list(move.spots.map((m) => m.toSpotId)),
      fromStart: booking.startDate,
      fromEnd: booking.endDate,
      toStart: after.startDate!,
      toEnd: after.endDate,
      fromDay: from,
      ...(overStockDays > 0 && { overStockDays }),
    },
    change: { before, after, added, removed, moved: [], spots: flags },
  });
}

/**
 * Moves a booking's umbrellas and/or dates in one transaction, logged as one `move` entry that
 * can be undone (ADR 0013). A booking that hasn't started may get new dates; a started one or a
 * season pass only new umbrellas, from `fromDate` (default today) to its end. Days before stay
 * where they were. If any new umbrella is booked on any day, nothing changes.
 */
export async function moveBooking(
  db: Kysely<DB>,
  userId: string,
  input: unknown,
  today: string = venueToday(),
): Promise<MoveResult> {
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  try {
    await db.transaction().execute((tx) => moveIn(tx, userId, parsed.data, today));
    return { ok: true };
  } catch (error) {
    if (error instanceof Refused) return error.result;
    if (error instanceof OverStock) return { ok: false, error: "stock", days: error.days };
    // Someone booked one of the umbrellas between the check and the write: the unique index won.
    if (isConflict(error)) return { ok: false, error: "taken", clashes: [] };
    throw error;
  }
}
