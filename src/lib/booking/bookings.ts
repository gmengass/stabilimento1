import { sql, type Kysely } from "kysely";
import { z } from "zod";
import type { DB } from "@/db/types";
import { isBookingDate } from "@/i18n/format";

/** Longest day / multi-day booking. Whole seasons are season passes (a later roadmap item). */
export const MAX_BOOKING_DAYS = 60;
export const MAX_SPOTS_PER_BOOKING = 20;

const bookingDate = z.string().refine(isBookingDate);

const createSchema = z
  .object({
    customerName: z.string().trim().min(1).max(100),
    customerPhone: z
      .string()
      .trim()
      .regex(/^\+?[\d\s./-]{5,30}$/)
      .refine((phone) => /\d{5}/.test(phone.replace(/\D/g, ""))),
    startDate: bookingDate,
    endDate: bookingDate,
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
  })
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

export type CancelResult = { ok: true } | { ok: false; error: "invalid" | "notFound" };

const PG_UNIQUE_VIOLATION = "23505";

function daysBetween(start: string, end: string): number {
  return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000;
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === PG_UNIQUE_VIOLATION;
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

/** True when every spot exists and each gets no more sunbeds than it can hold. */
async function sunbedsFit(
  db: Kysely<DB>,
  spots: { spotId: number; sunbeds: number }[],
): Promise<boolean> {
  const rows = await db
    .selectFrom("spot")
    .select(["id", "max_sunbeds"])
    .where(
      "id",
      "in",
      spots.map((s) => s.spotId),
    )
    .execute();
  const max = new Map(rows.map((row) => [row.id, row.max_sunbeds]));
  return spots.every((s) => max.has(s.spotId) && s.sunbeds <= (max.get(s.spotId) ?? 0));
}

/**
 * Books the spots for every day from start to end in one transaction (ADR 0004). If any spot is
 * taken on any day, nothing is written and the clashing spots and days come back. The unique
 * index decides races: of two staff booking the same spot at once, exactly one wins.
 */
export async function createBooking(
  db: Kysely<DB>,
  userId: string,
  input: unknown,
): Promise<CreateResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const booking = parsed.data;
  if (!(await sunbedsFit(db, booking.spots))) return { ok: false, error: "sunbeds" };

  const spotIds = booking.spots.map((s) => s.spotId);
  const clashes = await findClashes(db, spotIds, booking.startDate, booking.endDate);
  if (clashes.length > 0) return { ok: false, error: "taken", clashes };

  try {
    const bookingId = await db.transaction().execute(async (tx) => {
      const { id } = await tx
        .insertInto("booking")
        .values({
          kind: booking.startDate === booking.endDate ? "day" : "multi_day",
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
        .values(
          booking.spots.map((s) => ({ booking_id: id, spot_id: s.spotId, sunbeds: s.sunbeds })),
        )
        .returning("id")
        .execute();
      await sql`
        insert into spot_day (spot_id, booking_spot_id, date)
        select bs.spot_id, bs.id, d::date
        from booking_spot bs
        cross join generate_series(${booking.startDate}::date, ${booking.endDate}::date, '1 day') d
        where bs.id in (${sql.join(bookingSpots.map((b) => b.id))})
      `.execute(tx);
      return id;
    });
    return { ok: true, bookingId };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const lost = await findClashes(db, spotIds, booking.startDate, booking.endDate);
    return { ok: false, error: "taken", clashes: lost };
  }
}

const cancelSchema = z.object({ bookingId: z.number().int().positive() });

/** Cancels the whole booking and frees all its days. The booking itself is kept as history. */
export async function cancelBooking(
  db: Kysely<DB>,
  userId: string,
  input: unknown,
): Promise<CancelResult> {
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { bookingId } = parsed.data;
  return db.transaction().execute(async (tx) => {
    const cancelled = await tx
      .updateTable("booking")
      .set({ status: "cancelled", cancelled_at: new Date(), cancelled_by: userId })
      .where("id", "=", bookingId)
      .where("status", "=", "active")
      .returning("id")
      .executeTakeFirst();
    if (!cancelled) return { ok: false, error: "notFound" } as const;
    await tx
      .deleteFrom("spot_day")
      .where("booking_spot_id", "in", (q) =>
        q.selectFrom("booking_spot").select("id").where("booking_id", "=", bookingId),
      )
      .execute();
    return { ok: true } as const;
  });
}

export interface Occupant {
  bookingId: number;
  customerName: string;
  customerPhone: string;
  startDate: string;
  endDate: string;
  notes: string;
  /** Every umbrella in the booking with its sunbeds, so staff see the whole group. */
  spots: { number: number; sunbeds: number }[];
}

/** Who is on each spot on one day, keyed by spot id. Only `booked` days count. */
export async function loadOccupancy(
  db: Kysely<DB>,
  areaId: number,
  date: string,
): Promise<Record<number, Occupant>> {
  const rows = await db
    .selectFrom("spot_day")
    .innerJoin("booking_spot", "booking_spot.id", "spot_day.booking_spot_id")
    .innerJoin("booking", "booking.id", "booking_spot.booking_id")
    .innerJoin("spot", "spot.id", "spot_day.spot_id")
    .select((eb) => [
      "spot_day.spot_id as spotId",
      "booking.id as bookingId",
      "booking.customer_name as customerName",
      "booking.customer_phone as customerPhone",
      "booking.start_date as startDate",
      "booking.end_date as endDate",
      "booking.notes",
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
    .where("spot_day.state", "=", "booked")
    .execute();
  return Object.fromEntries(
    rows.map(({ spotId, spots, ...occupant }) => [spotId, { ...occupant, spots: spots ?? [] }]),
  );
}
