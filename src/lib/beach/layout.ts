import { sql, type Kysely } from "kysely";
import { z } from "zod";
import type { DB, SpotKind } from "@/db/types";
import { MAX_LINES, MAX_UMBRELLAS_PER_LINE } from "./limits";

/** Default umbrella number (ADR 0004): line × 100 + position, e.g. line 2, position 3 = 203. */
export function defaultSpotNumber(line: number, position: number): number {
  return line * 100 + position;
}

export interface MapSpot {
  id: number;
  number: number;
  position: number;
  kind: SpotKind;
  includedSunbeds: number;
  maxSunbeds: number;
}

export interface MapLine {
  number: number;
  spots: MapSpot[];
}

export interface BeachLayout {
  venueName: string;
  areaId: number;
  areaName: string;
  lines: MapLine[];
}

/** The beach as staff see it: one venue and one area at launch, lines from the shore out. */
export async function loadBeach(db: Kysely<DB>): Promise<BeachLayout | null> {
  const area = await db
    .selectFrom("area")
    .innerJoin("venue", "venue.id", "area.venue_id")
    .select(["area.id", "area.name", "venue.name as venueName"])
    .orderBy("venue.id")
    .orderBy("area.sort_order")
    .orderBy("area.id")
    .executeTakeFirst();
  if (!area) return null;

  const rows = await db
    .selectFrom("spot")
    .innerJoin("area_line", "area_line.id", "spot.line_id")
    .select([
      "area_line.number as line",
      "spot.id",
      "spot.number",
      "spot.position",
      "spot.kind",
      "spot.included_sunbeds",
      "spot.max_sunbeds",
    ])
    .where("spot.area_id", "=", area.id)
    .orderBy("area_line.number")
    .orderBy("spot.position")
    .execute();

  const lines = new Map<number, MapSpot[]>();
  for (const row of rows) {
    const spots = lines.get(row.line) ?? [];
    spots.push({
      id: row.id,
      number: row.number,
      position: row.position,
      kind: row.kind,
      includedSunbeds: row.included_sunbeds,
      maxSunbeds: row.max_sunbeds,
    });
    lines.set(row.line, spots);
  }
  return {
    venueName: area.venueName,
    areaId: area.id,
    areaName: area.name,
    lines: [...lines].map(([number, spots]) => ({ number, spots })),
  };
}

const setupSchema = z.object({
  venueName: z.string().trim().min(1).max(100),
  lines: z.coerce.number().int().min(1).max(MAX_LINES),
  umbrellasPerLine: z.coerce.number().int().min(1).max(MAX_UMBRELLAS_PER_LINE),
});

export type SetupError = "invalid" | "exists";
export type SetupResult = { ok: true } | { ok: false; error: SetupError };

/**
 * First-time setup on a fresh box: one venue, one area, `lines` lines of `umbrellasPerLine`
 * default umbrellas. Refuses if any venue exists, so it can never touch a beach in use.
 */
export async function setupBeach(db: Kysely<DB>, input: unknown): Promise<SetupResult> {
  const parsed = setupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { venueName, lines, umbrellasPerLine } = parsed.data;

  return db.transaction().execute(async (tx) => {
    // Two admins submitting at once: the second waits here, then sees the first one's venue.
    await sql`lock table venue in exclusive mode`.execute(tx);
    const existing = await tx.selectFrom("venue").select("id").executeTakeFirst();
    if (existing) return { ok: false, error: "exists" } as const;

    const venue = await tx
      .insertInto("venue")
      .values({ name: venueName, slug: "lido" })
      .returning("id")
      .executeTakeFirstOrThrow();
    const area = await tx
      .insertInto("area")
      .values({ venue_id: venue.id, name: venueName, slug: "main" })
      .returning("id")
      .executeTakeFirstOrThrow();

    for (let line = 1; line <= lines; line++) {
      const { id: lineId } = await tx
        .insertInto("area_line")
        .values({ area_id: area.id, number: line })
        .returning("id")
        .executeTakeFirstOrThrow();
      await tx
        .insertInto("spot")
        .values(
          Array.from({ length: umbrellasPerLine }, (_, i) => ({
            area_id: area.id,
            line_id: lineId,
            position: i + 1,
            number: defaultSpotNumber(line, i + 1),
          })),
        )
        .execute();
    }
    return { ok: true } as const;
  });
}
