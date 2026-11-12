import { sql, type Kysely, type Transaction } from "kysely";
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

export interface AreaTab {
  id: number;
  name: string;
}

/** The beach spaces (areas) of the club, in display order. */
export async function listAreas(db: Kysely<DB>): Promise<AreaTab[]> {
  return db
    .selectFrom("area")
    .select(["area.id", "area.name"])
    .where("venue_id", "=", (q) => q.selectFrom("venue").select("id").orderBy("id").limit(1))
    .orderBy("sort_order")
    .orderBy("id")
    .execute();
}

/** Reads an area id from a URL parameter; anything else means "the first area". */
export function parseAreaId(value: unknown): number | undefined {
  if (typeof value !== "string" || !/^\d{1,9}$/.test(value)) return undefined;
  return Number(value);
}

/**
 * One beach space as staff see it, lines from the shore out. `areaId` picks the space; without
 * it, or if it doesn't exist, the first space is shown.
 */
export async function loadBeach(db: Kysely<DB>, areaId?: number): Promise<BeachLayout | null> {
  const areas = await listAreas(db);
  const picked = areas.find((a) => a.id === areaId) ?? areas[0];
  if (!picked) return null;
  const area = await db
    .selectFrom("area")
    .innerJoin("venue", "venue.id", "area.venue_id")
    .select(["area.id", "area.name", "venue.name as venueName"])
    .where("area.id", "=", picked.id)
    .executeTakeFirstOrThrow();

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

const name = z.string().trim().min(1).max(100);

export const areaSchema = z.object({
  areaName: name,
  lines: z.coerce.number().int().min(1).max(MAX_LINES),
  umbrellasPerLine: z.coerce.number().int().min(1).max(MAX_UMBRELLAS_PER_LINE),
});

const setupSchema = areaSchema.extend({ venueName: name });

/** URL-safe slug from a name, e.g. "Spiaggia Nord" → "spiaggia-nord". */
function slugify(text: string): string {
  const slug = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "area";
}

/**
 * Creates a beach space with `lines` lines of `umbrellasPerLine` default umbrellas, after the
 * venue's other spaces. Call inside a transaction that holds the venue lock.
 */
export async function createArea(
  tx: Transaction<DB>,
  venueId: number,
  input: z.output<typeof areaSchema>,
): Promise<number> {
  const existing = await tx
    .selectFrom("area")
    .select(["slug", "sort_order"])
    .where("venue_id", "=", venueId)
    .execute();
  const base = slugify(input.areaName);
  const taken = new Set(existing.map((a) => a.slug));
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  const sortOrder = Math.max(-1, ...existing.map((a) => a.sort_order)) + 1;

  const area = await tx
    .insertInto("area")
    .values({ venue_id: venueId, name: input.areaName, slug, sort_order: sortOrder })
    .returning("id")
    .executeTakeFirstOrThrow();
  for (let line = 1; line <= input.lines; line++) {
    const { id: lineId } = await tx
      .insertInto("area_line")
      .values({ area_id: area.id, number: line })
      .returning("id")
      .executeTakeFirstOrThrow();
    await tx
      .insertInto("spot")
      .values(
        Array.from({ length: input.umbrellasPerLine }, (_, i) => ({
          area_id: area.id,
          line_id: lineId,
          position: i + 1,
          number: defaultSpotNumber(line, i + 1),
        })),
      )
      .execute();
  }
  return area.id;
}

export type SetupError = "invalid" | "exists";
export type SetupResult = { ok: true } | { ok: false; error: SetupError };

/**
 * First-time setup on a fresh box: the venue and its first beach space. Refuses if any venue
 * exists, so it can never touch a beach in use. More spaces are added in Beach settings.
 */
export async function setupBeach(db: Kysely<DB>, input: unknown): Promise<SetupResult> {
  const parsed = setupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  return db.transaction().execute(async (tx) => {
    // Two admins submitting at once: the second waits here, then sees the first one's venue.
    await sql`lock table venue in exclusive mode`.execute(tx);
    const existing = await tx.selectFrom("venue").select("id").executeTakeFirst();
    if (existing) return { ok: false, error: "exists" } as const;

    const venue = await tx
      .insertInto("venue")
      .values({ name: parsed.data.venueName, slug: "lido" })
      .returning("id")
      .executeTakeFirstOrThrow();
    await createArea(tx, venue.id, parsed.data);
    return { ok: true } as const;
  });
}
