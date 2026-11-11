import type { Kysely, Transaction } from "kysely";
import type { DB } from "./types";

// Fictional demo beach. Lines are numbered from the shore; umbrellas carry one number per area.
export const demoLayout = {
  venue: { name: "Lido Demo", slug: "lido-demo" },
  area: { name: "Spiaggia principale", slug: "main" },
  lines: 6,
  umbrellasPerLine: 20,
} as const;

type Tx = Transaction<DB>;

async function ensureVenue(tx: Tx): Promise<number> {
  const { venue } = demoLayout;
  await tx
    .insertInto("venue")
    .values(venue)
    .onConflict((oc) => oc.column("slug").doNothing())
    .execute();
  const row = await tx
    .selectFrom("venue")
    .select("id")
    .where("slug", "=", venue.slug)
    .executeTakeFirstOrThrow();
  return row.id;
}

async function ensureArea(tx: Tx, venueId: number): Promise<number> {
  const { area } = demoLayout;
  await tx
    .insertInto("area")
    .values({ ...area, venue_id: venueId })
    .onConflict((oc) => oc.columns(["venue_id", "slug"]).doNothing())
    .execute();
  const row = await tx
    .selectFrom("area")
    .select("id")
    .where("venue_id", "=", venueId)
    .where("slug", "=", area.slug)
    .executeTakeFirstOrThrow();
  return row.id;
}

async function ensureLine(tx: Tx, areaId: number, lineNumber: number): Promise<number> {
  await tx
    .insertInto("area_line")
    .values({ area_id: areaId, number: lineNumber })
    .onConflict((oc) => oc.columns(["area_id", "number"]).doNothing())
    .execute();
  const row = await tx
    .selectFrom("area_line")
    .select("id")
    .where("area_id", "=", areaId)
    .where("number", "=", lineNumber)
    .executeTakeFirstOrThrow();
  return row.id;
}

async function ensureUmbrellas(
  tx: Tx,
  areaId: number,
  lineId: number,
  lineNumber: number,
): Promise<void> {
  const { umbrellasPerLine } = demoLayout;
  const values = Array.from({ length: umbrellasPerLine }, (_, i) => ({
    area_id: areaId,
    line_id: lineId,
    position: i + 1,
    number: (lineNumber - 1) * umbrellasPerLine + i + 1,
  }));
  await tx
    .insertInto("spot")
    .values(values)
    .onConflict((oc) => oc.doNothing())
    .execute();
}

// Adds whatever is missing from the demo layout. Never updates or deletes existing rows.
export async function seedDemo(db: Kysely<DB>): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to load demo seed data with NODE_ENV=production");
  }
  await db.transaction().execute(async (tx) => {
    const venueId = await ensureVenue(tx);
    const areaId = await ensureArea(tx, venueId);
    for (let lineNumber = 1; lineNumber <= demoLayout.lines; lineNumber++) {
      const lineId = await ensureLine(tx, areaId, lineNumber);
      await ensureUmbrellas(tx, areaId, lineId, lineNumber);
    }
  });
}
