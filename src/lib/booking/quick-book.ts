import type { Kysely } from "kysely";
import { z } from "zod";
import type { DB } from "@/db/types";
import { addDays, venueToday } from "@/i18n/format";
import { MAX_DECKCHAIRS_PER_UMBRELLA } from "@/lib/beach/limits";
import { quotePrice } from "@/lib/pricing/price-list";
import type { Suggestion as Price } from "@/lib/pricing/suggest";
import { bookingDate, MAX_SPOTS_PER_BOOKING } from "./bookings";
import { suggestSpots, type SuggestResult, type Umbrella } from "./suggest";

/** Long enough for a whole season pass. */
const MAX_QUICK_BOOK_DAYS = 366;

const quickSchema = z
  .object({
    areaId: z.number().int().positive(),
    umbrellas: z.number().int().min(1).max(MAX_SPOTS_PER_BOOKING),
    sunbeds: z
      .number()
      .int()
      .min(0)
      .max(MAX_SPOTS_PER_BOOKING * 10),
    deckchairs: z
      .number()
      .int()
      .min(0)
      .max(MAX_SPOTS_PER_BOOKING * MAX_DECKCHAIRS_PER_UMBRELLA)
      .default(0),
    startDate: bookingDate,
    endDate: bookingDate,
  })
  .refine((q) => q.endDate >= q.startDate)
  .refine(
    (q) => (Date.parse(q.endDate) - Date.parse(q.startDate)) / 86_400_000 < MAX_QUICK_BOOK_DAYS,
  );

export type QuickSuggestResult =
  | (Extract<SuggestResult, { ok: true }> & { price: Price | null })
  | Extract<SuggestResult, { ok: false }>
  | { ok: false; error: "invalid" | "past" };

/** Days from start to end, both included. */
function daysBetween(startDate: string, endDate: string): number {
  let days = 1;
  for (let d = startDate; d < endDate; d = addDays(d, 1)) days++;
  return days;
}

/** Umbrellas of the space with no `booked` day in the range: released days count as free. */
async function loadFreeUmbrellas(
  db: Kysely<DB>,
  areaId: number,
  startDate: string,
  endDate: string,
): Promise<Umbrella[]> {
  return db
    .selectFrom("spot")
    .innerJoin("area_line", "area_line.id", "spot.line_id")
    .select([
      "spot.id as spotId",
      "spot.number",
      "area_line.number as line",
      "spot.position",
      "spot.max_sunbeds as maxSunbeds",
    ])
    .where("spot.area_id", "=", areaId)
    .where("spot.kind", "=", "umbrella")
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom("spot_day")
            .select("spot_day.spot_id")
            .whereRef("spot_day.spot_id", "=", "spot.id")
            .where("spot_day.state", "=", "booked")
            .where("spot_day.date", ">=", startDate)
            .where("spot_day.date", "<=", endDate),
        ),
      ),
    )
    .execute();
}

/**
 * Suggests umbrellas in one beach space that are free on every day from start to end. Nothing is
 * booked here: staff confirm a suggestion through the normal booking or season-pass action, so
 * the unique index still decides a race between two desks.
 */
export async function suggestQuickBook(
  db: Kysely<DB>,
  input: unknown,
  today: string = venueToday(),
): Promise<QuickSuggestResult> {
  const parsed = quickSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { areaId, umbrellas, sunbeds, deckchairs, startDate, endDate } = parsed.data;
  if (startDate < today) return { ok: false, error: "past" };
  const free = await loadFreeUmbrellas(db, areaId, startDate, endDate);
  const result = suggestSpots(free, umbrellas, sunbeds);
  if (!result.ok) return result;
  // The booking form caps deckchairs per umbrella (ADR 0020); price what it will book.
  const pieces =
    umbrellas + sunbeds + Math.min(deckchairs, umbrellas * MAX_DECKCHAIRS_PER_UMBRELLA);
  const price = await quotePrice(db, startDate, pieces, daysBetween(startDate, endDate));
  return { ...result, price };
}
