import { sql, type Kysely } from "kysely";
import { z } from "zod";
import type { BookingKind, DB } from "@/db/types";
import { isBookingDate, venueToday } from "@/i18n/format";

/** Longest day / multi-day booking. Whole seasons are season passes (`passes.ts`). */
export const MAX_BOOKING_DAYS = 60;
export const MAX_SPOTS_PER_BOOKING = 20;

export const bookingDate = z.string().refine(isBookingDate);

const phoneNumber = z
  .string()
  .trim()
  .regex(/^\+?[\d\s./-]{5,30}$/)
  .refine((phone) => /\d{5}/.test(phone.replace(/\D/g, "")));

/** Optional: a missing or blank phone is stored as NULL. A given one must look like a number. */
const optionalPhone = z
  .union([z.string().trim().length(0), phoneNumber])
  .nullish()
  .transform((phone) => phone || null);

/** Who books and which spots: the same for day bookings and season passes. */
export const customerAndSpots = {
  customerName: z.string().trim().min(1).max(100),
  customerPhone: optionalPhone,
  notes: z.string().trim().max(500).default(""),
  spots: z
    .array(
      z.object({
        spotId: z.number().int().positive(),
        sunbeds: z.number().int().min(0).max(10),
      }),
    )
    .min(1)
    .max(MAX_SPOTS_PER_BOOKING)
    .refine((spots) => new Set(spots.map((s) => s.spotId)).size === spots.length),
};

const createSchema = z
  .object({ ...customerAndSpots, startDate: bookingDate, endDate: bookingDate })
  .refine((b) => b.endDate >= b.startDate)
  .refine((b) => daysBetween(b.startDate, b.endDate) < MAX_BOOKING_DAYS);

export type CreateBookingInput = z.input<typeof createSchema>;

export interface Clash {
  spotNumber: number;
  date: string;
}

export type CreateResult =
  | { ok: true; bookingId: number }
  | { ok: false; error: "invalid" | "sunbeds" }
  | { ok: false; error: "taken"; clashes: Clash[] };

export type CancelResult = { ok: true } | { ok: false; error: "invalid" | "notFound" | "ended" };

/** Unique violation (the spot was taken) or deadlock (an overlapping booking got there first). */
const CONFLICT_CODES = new Set(["23505", "40P01"]);

function daysBetween(start: string, end: string): number {
  return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000;
}

export function isConflict(error: unknown): boolean {
  return CONFLICT_CODES.has(String((error as { code?: unknown } | null)?.code));
}

/** Days already `booked` for any of these spots between the dates (inclusive). */
async function findClashes(
  db: Kysely<DB>,
  spotIds: number[],
  startDate: string,
  endDate: string,
): Promise<Clash[]> {
  const rows = await db
    .selectFrom("spot_day")
    .innerJoin("spot", "spot.id", "spot_day.spot_id")
    .select(["spot.number as spotNumber", "spot_day.date"])
    .where("spot_day.spot_id", "in", spotIds)
    .where("spot_day.state", "=", "booked")
    .where("spot_day.date", ">=", startDate)
    .where("spot_day.date", "<=", endDate)
    .orderBy("spot_day.date")
    .orderBy("spot.number")
    .execute();
  return rows.map((row) => ({ spotNumber: row.spotNumber, date: row.date }));
}

/**
 * "ok" when every spot exists, all are in the same beach space, and each gets no more sunbeds
 * than it can hold. With `lock`, the spot rows stay share-locked until the transaction ends, so
 * an admin can't lower a limit between this check and the insert.
 */
async function sunbedsFit(
  db: Kysely<DB>,
  spots: { spotId: number; sunbeds: number }[],
  lock = false,
): Promise<"ok" | "sunbeds" | "mixedAreas"> {
  const query = db
    .selectFrom("spot")
    .select(["id", "max_sunbeds", "area_id"])
    .where(
      "id",
      "in",
      spots.map((s) => s.spotId),
    )
    .orderBy("id");
  const rows = await (lock ? query.forShare() : query).execute();
  const max = new Map(rows.map((row) => [row.id, row.max_sunbeds]));
  // One booking stays in one beach space: umbrella numbers repeat across spaces.
  if (new Set(rows.map((row) => row.area_id)).size > 1) return "mixedAreas";
  const fits = spots.every((s) => max.has(s.spotId) && s.sunbeds <= (max.get(s.spotId) ?? 0));
  return fits ? "ok" : "sunbeds";
}

/** A validated booking ready to be written. A season pass names its season. */
export interface BookingToWrite {
  customerName: string;
  customerPhone: string | null;
  startDate: string;
  endDate: string;
  notes: string;
  spots: { spotId: number; sunbeds: number }[];
  seasonId?: number;
}

/** The sunbed limits or the season's dates changed between the first check and the insert. */
class Stale extends Error {
  constructor(readonly reason: "sunbeds" | "invalid") {
    super(reason);
  }
}

function kindOf(booking: BookingToWrite): BookingKind {
  if (booking.seasonId !== undefined) return "season";
  return booking.startDate === booking.endDate ? "day" : "multi_day";
}

/** Share-locks the season so an admin can't move its dates under a pass being written. */
async function seasonStillCovers(tx: Kysely<DB>, booking: BookingToWrite): Promise<boolean> {
  if (booking.seasonId === undefined) return true;
  const season = await tx
    .selectFrom("season")
    .select(["start_date", "end_date"])
    .where("id", "=", booking.seasonId)
    .forShare()
    .executeTakeFirst();
  return !!season && booking.startDate >= season.start_date && booking.endDate <= season.end_date;
}

/** Inserts the booking and one spot_day per spot per day, in one transaction. */
async function insertBooking(db: Kysely<DB>, userId: string, booking: BookingToWrite) {
  return db.transaction().execute(async (tx) => {
    if (!(await seasonStillCovers(tx, booking))) throw new Stale("invalid");
    if ((await sunbedsFit(tx, booking.spots, true)) !== "ok") throw new Stale("sunbeds");
    const { id } = await tx
      .insertInto("booking")
      .values({
        kind: kindOf(booking),
        season_id: booking.seasonId ?? null,
        customer_name: booking.customerName,
        customer_phone: booking.customerPhone,
        start_date: booking.startDate,
        end_date: booking.endDate,
        notes: booking.notes,
        created_by: userId,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    const bookingSpots = await tx
      .insertInto("booking_spot")
      .values(booking.spots.map((s) => ({ booking_id: id, spot_id: s.spotId, sunbeds: s.sunbeds })))
      .returning("id")
      .execute();
    // A fixed row order means two overlapping bookings wait for each other instead of deadlocking.
    await sql`
      insert into spot_day (spot_id, booking_spot_id, date)
      select bs.spot_id, bs.id, d::date
      from booking_spot bs
      cross join generate_series(${booking.startDate}::date, ${booking.endDate}::date, '1 day') d
      where bs.id in (${sql.join(bookingSpots.map((b) => b.id))})
      order by bs.spot_id, d
    `.execute(tx);
    return id;
  });
}

const ATTEMPTS = 2;

/**
 * Books the spots for every day from start to end in one transaction (ADR 0004). If any spot is
 * taken on any day, nothing is written and the clashing spots and days come back. The unique
 * index decides races: of two staff booking the same spot at once, exactly one wins. If the
 * winner is cancelled before we can name the clash, we simply try again.
 */
export async function bookSpots(
  db: Kysely<DB>,
  userId: string,
  booking: BookingToWrite,
): Promise<CreateResult> {
  const fit = await sunbedsFit(db, booking.spots);
  if (fit === "mixedAreas") return { ok: false, error: "invalid" };
  if (fit === "sunbeds") return { ok: false, error: "sunbeds" };

  const spotIds = booking.spots.map((s) => s.spotId);
  for (let attempt = 1; ; attempt++) {
    const clashes = await findClashes(db, spotIds, booking.startDate, booking.endDate);
    if (clashes.length > 0) return { ok: false, error: "taken", clashes };
    try {
      return { ok: true, bookingId: await insertBooking(db, userId, booking) };
    } catch (error) {
      if (error instanceof Stale) return { ok: false, error: error.reason };
      if (!isConflict(error)) throw error;
      if (attempt >= ATTEMPTS) return { ok: false, error: "taken", clashes: [] };
    }
  }
}

/** A day or multi-day booking. Season passes go through `createSeasonPass`. */
export async function createBooking(
  db: Kysely<DB>,
  userId: string,
  input: unknown,
): Promise<CreateResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  return bookSpots(db, userId, parsed.data);
}

const cancelSchema = z.object({ bookingId: z.number().int().positive() });

/**
 * Cancels the booking and frees its days from `today` on. Days already used stay on record, so
 * the map still shows who sat where. A booking that has fully ended can't be cancelled.
 */
export async function cancelBooking(
  db: Kysely<DB>,
  userId: string,
  input: unknown,
  today: string = venueToday(),
): Promise<CancelResult> {
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { bookingId } = parsed.data;
  return db.transaction().execute(async (tx) => {
    const booking = await tx
      .selectFrom("booking")
      .select("end_date")
      .where("id", "=", bookingId)
      .where("status", "=", "active")
      .forUpdate()
      .executeTakeFirst();
    if (!booking) return { ok: false, error: "notFound" } as const;
    if (booking.end_date < today) return { ok: false, error: "ended" } as const;
    await tx
      .updateTable("booking")
      .set({ status: "cancelled", cancelled_at: new Date(), cancelled_by: userId })
      .where("id", "=", bookingId)
      .execute();
    await tx
      .deleteFrom("spot_day")
      .where("date", ">=", today)
      .where("booking_spot_id", "in", (q) =>
        q.selectFrom("booking_spot").select("id").where("booking_id", "=", bookingId),
      )
      .execute();
    return { ok: true } as const;
  });
}

export interface Occupant {
  bookingId: number;
  kind: BookingKind;
  customerName: string;
  customerPhone: string | null;
  startDate: string;
  endDate: string;
  notes: string;
  /** Days the holder gave back, counted from spot_day so it can't drift (ADR 0004). */
  releasedDays: number;
  /** Every umbrella in the booking with its sunbeds, so staff see the whole group. */
  spots: { number: number; sunbeds: number }[];
}

/**
 * Who has each spot on one day, keyed by spot id. `booked` rows are the occupants; `released`
 * rows are season-pass holders who gave the day back (the spot is free unless someone else
 * booked it).
 */
async function loadSpotDays(
  db: Kysely<DB>,
  areaId: number,
  date: string,
  state: "booked" | "released",
): Promise<Record<number, Occupant>> {
  const rows = await db
    .selectFrom("spot_day")
    .innerJoin("booking_spot", "booking_spot.id", "spot_day.booking_spot_id")
    .innerJoin("booking", "booking.id", "booking_spot.booking_id")
    .innerJoin("spot", "spot.id", "spot_day.spot_id")
    .select((eb) => [
      "spot_day.spot_id as spotId",
      "booking.id as bookingId",
      "booking.kind",
      "booking.customer_name as customerName",
      "booking.customer_phone as customerPhone",
      "booking.start_date as startDate",
      "booking.end_date as endDate",
      "booking.notes",
      eb
        .selectFrom("spot_day as sd")
        .innerJoin("booking_spot as bs", "bs.id", "sd.booking_spot_id")
        .select(sql<number>`count(distinct sd.date)::int`.as("n"))
        .whereRef("bs.booking_id", "=", "booking.id")
        .where("sd.state", "=", "released")
        .as("releasedDays"),
      eb
        .selectFrom("booking_spot as other")
        .innerJoin("spot as s", "s.id", "other.spot_id")
        .select(
          sql<Occupant["spots"]>`json_agg(
            json_build_object('number', s.number, 'sunbeds', other.sunbeds) order by s.number
          )`.as("spots"),
        )
        .whereRef("other.booking_id", "=", "booking.id")
        .as("spots"),
    ])
    .where("spot.area_id", "=", areaId)
    .where("spot_day.date", "=", date)
    .where("spot_day.state", "=", state)
    .orderBy("booking.id")
    .execute();
  return Object.fromEntries(
    rows.map(({ spotId, spots, releasedDays, ...occupant }) => [
      spotId,
      { ...occupant, releasedDays: releasedDays ?? 0, spots: spots ?? [] },
    ]),
  );
}

/** Who is on each spot on one day, keyed by spot id. Only `booked` days count. */
export function loadOccupancy(db: Kysely<DB>, areaId: number, date: string) {
  return loadSpotDays(db, areaId, date, "booked");
}

/** Season passes that released this day, keyed by spot id (the latest pass if several did). */
export function loadReleased(db: Kysely<DB>, areaId: number, date: string) {
  return loadSpotDays(db, areaId, date, "released");
}
