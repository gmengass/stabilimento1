import { sql, type Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, getDb } from "@/db/client";
import { runMigrations } from "@/db/migrator";
import type { DB } from "@/db/types";
import { testDatabaseUrl } from "./test-database";

// SQLSTATE codes asserted below.
const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";
const FOREIGN_KEY_VIOLATION = "23503";
const INVALID_TEXT_REPRESENTATION = "22P02";

const TABLES = ["venue", "area", "area_line", "spot"] as const;

let db: Kysely<DB>;
let migrated = false;

beforeAll(async () => {
  db = createDb(testDatabaseUrl());
  const result = await runMigrations(db, "up");
  if (result.error) throw result.error;
  migrated = true;
});

beforeEach(async () => {
  if (!migrated) throw new Error("migrations did not run; refusing to truncate");
  await sql`truncate venue, area, area_line, spot restart identity cascade`.execute(db);
});

afterAll(async () => {
  await db.destroy();
  await getDb().destroy();
});

async function expectPgError(query: Promise<unknown>, code: string): Promise<void> {
  await expect(query).rejects.toMatchObject({ code });
}

async function insertId(query: ReturnType<typeof sql<{ id: number }>>): Promise<number> {
  const { rows } = await query.execute(db);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error("insert returned no id");
  return id;
}

function insertVenue(slug = "lido", name = "Lido"): Promise<number> {
  return insertId(sql<{ id: number }>`
    insert into venue (name, slug) values (${name}, ${slug}) returning id`);
}

function insertArea(venueId: number, slug = "main", name = "Main"): Promise<number> {
  return insertId(sql<{ id: number }>`
    insert into area (venue_id, name, slug) values (${venueId}, ${name}, ${slug}) returning id`);
}

function insertLine(areaId: number, number = 1): Promise<number> {
  return insertId(sql<{ id: number }>`
    insert into area_line (area_id, number) values (${areaId}, ${number}) returning id`);
}

interface SpotInput {
  areaId: number;
  lineId: number;
  number: number;
  position: number;
  kind?: string;
  includedSunbeds?: number;
  maxSunbeds?: number;
}

function insertSpot(s: SpotInput): Promise<number> {
  const kind = s.kind ?? "umbrella";
  if (s.includedSunbeds === undefined && s.maxSunbeds === undefined) {
    return insertId(sql<{ id: number }>`
      insert into spot (area_id, line_id, number, position, kind)
      values (${s.areaId}, ${s.lineId}, ${s.number}, ${s.position}, ${kind}::spot_kind)
      returning id`);
  }
  return insertId(sql<{ id: number }>`
    insert into spot (area_id, line_id, number, position, kind, included_sunbeds, max_sunbeds)
    values (${s.areaId}, ${s.lineId}, ${s.number}, ${s.position}, ${kind}::spot_kind,
            ${s.includedSunbeds ?? 2}, ${s.maxSunbeds ?? 3})
    returning id`);
}

async function baseLayout() {
  const venueId = await insertVenue();
  const areaId = await insertArea(venueId);
  const lineId = await insertLine(areaId, 1);
  return { venueId, areaId, lineId };
}

describe("AC1: schema objects", () => {
  it("creates the venue, area, area_line and spot tables", async () => {
    const { rows } = await sql<{ table_name: string }>`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_name in ('venue', 'area', 'area_line', 'spot')
    `.execute(db);
    expect(rows.map((r) => r.table_name).sort()).toEqual([...TABLES].sort());
  });

  it("creates the spot_kind enum with umbrella and sunbed", async () => {
    const { rows } = await sql<{ label: string }>`
      select e.enumlabel as label from pg_enum e join pg_type t on t.oid = e.enumtypid
      where t.typname = 'spot_kind' order by e.enumsortorder
    `.execute(db);
    expect(rows.map((r) => r.label).sort()).toEqual(["sunbed", "umbrella"]);
  });

  it("creates the set_updated_at() function", async () => {
    const { rows } = await sql<{ n: number }>`
      select count(*)::int as n from pg_proc where proname = 'set_updated_at'
    `.execute(db);
    expect(rows[0]?.n).toBe(1);
  });
});

describe("AC2: natural keys are unique", () => {
  it("rejects a duplicate venue slug", async () => {
    await insertVenue("lido");
    await expectPgError(insertVenue("lido", "Other"), UNIQUE_VIOLATION);
  });

  it("rejects a duplicate area slug within a venue, allows it in another venue", async () => {
    const v1 = await insertVenue("one");
    const v2 = await insertVenue("two");
    await insertArea(v1, "main");
    await expectPgError(insertArea(v1, "main", "Other"), UNIQUE_VIOLATION);
    await expect(insertArea(v2, "main")).resolves.toBeTypeOf("number");
  });

  it("rejects a duplicate line number within an area, allows it in another area", async () => {
    const v = await insertVenue();
    const a1 = await insertArea(v, "a1");
    const a2 = await insertArea(v, "a2");
    await insertLine(a1, 1);
    await expectPgError(insertLine(a1, 1), UNIQUE_VIOLATION);
    await expect(insertLine(a2, 1)).resolves.toBeTypeOf("number");
  });

  it("rejects two spots at the same position in a line", async () => {
    const { areaId, lineId } = await baseLayout();
    await insertSpot({ areaId, lineId, number: 1, position: 1 });
    await expectPgError(insertSpot({ areaId, lineId, number: 2, position: 1 }), UNIQUE_VIOLATION);
  });

  it("rejects a duplicate spot number within an area, even on a different line", async () => {
    const { areaId, lineId } = await baseLayout();
    const line2 = await insertLine(areaId, 2);
    await insertSpot({ areaId, lineId, number: 7, position: 1 });
    await expectPgError(
      insertSpot({ areaId, lineId: line2, number: 7, position: 1 }),
      UNIQUE_VIOLATION,
    );
  });

  it("allows the same spot number in different areas", async () => {
    const v = await insertVenue();
    const a1 = await insertArea(v, "a1");
    const a2 = await insertArea(v, "a2");
    const l1 = await insertLine(a1, 1);
    const l2 = await insertLine(a2, 1);
    await insertSpot({ areaId: a1, lineId: l1, number: 1, position: 1 });
    await expect(
      insertSpot({ areaId: a2, lineId: l2, number: 1, position: 1 }),
    ).resolves.toBeTypeOf("number");
  });

  it("lets exactly one of two concurrent inserts of the same spot number win", async () => {
    const { areaId, lineId } = await baseLayout();
    const results = await Promise.allSettled([
      insertSpot({ areaId, lineId, number: 5, position: 1 }),
      insertSpot({ areaId, lineId, number: 5, position: 2 }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it("rejects a spot whose area_id differs from its line's area", async () => {
    const v = await insertVenue();
    const a1 = await insertArea(v, "a1");
    const a2 = await insertArea(v, "a2");
    const lineInA1 = await insertLine(a1, 1);
    await expectPgError(
      insertSpot({ areaId: a2, lineId: lineInA1, number: 1, position: 1 }),
      FOREIGN_KEY_VIOLATION,
    );
  });
});

describe("AC3: check constraints and enum", () => {
  it("rejects line number < 1", async () => {
    const { areaId } = await baseLayout();
    await expectPgError(insertLine(areaId, 0), CHECK_VIOLATION);
    await expectPgError(insertLine(areaId, -1), CHECK_VIOLATION);
  });

  it("rejects spot position < 1", async () => {
    const { areaId, lineId } = await baseLayout();
    await expectPgError(insertSpot({ areaId, lineId, number: 1, position: 0 }), CHECK_VIOLATION);
  });

  it("rejects spot number < 1", async () => {
    const { areaId, lineId } = await baseLayout();
    await expectPgError(insertSpot({ areaId, lineId, number: 0, position: 1 }), CHECK_VIOLATION);
  });

  it("rejects included_sunbeds > max_sunbeds", async () => {
    const { areaId, lineId } = await baseLayout();
    await expectPgError(
      insertSpot({ areaId, lineId, number: 1, position: 1, includedSunbeds: 4, maxSunbeds: 3 }),
      CHECK_VIOLATION,
    );
  });

  it("rejects max_sunbeds < 1", async () => {
    const { areaId, lineId } = await baseLayout();
    await expectPgError(
      insertSpot({ areaId, lineId, number: 1, position: 1, includedSunbeds: 0, maxSunbeds: 0 }),
      CHECK_VIOLATION,
    );
  });

  it("rejects negative included_sunbeds", async () => {
    const { areaId, lineId } = await baseLayout();
    await expectPgError(
      insertSpot({ areaId, lineId, number: 1, position: 1, includedSunbeds: -1, maxSunbeds: 3 }),
      CHECK_VIOLATION,
    );
  });

  it("allows an umbrella with more than 3 sunbeds (no upper cap, ADR 0004)", async () => {
    const { areaId, lineId } = await baseLayout();
    await expect(
      insertSpot({ areaId, lineId, number: 1, position: 1, includedSunbeds: 4, maxSunbeds: 6 }),
    ).resolves.toBeTypeOf("number");
  });

  it.each(["", "   "])("rejects a blank venue name (%j)", async (name) => {
    await expectPgError(insertVenue("lido", name), CHECK_VIOLATION);
  });

  it.each(["", "   "])("rejects a blank area name (%j)", async (name) => {
    const venueId = await insertVenue();
    await expectPgError(insertArea(venueId, "main", name), CHECK_VIOLATION);
  });

  it.each(["Lido Demo", "UPPER", "lido_demo", ""])("rejects venue slug %j", async (slug) => {
    await expectPgError(insertVenue(slug), CHECK_VIOLATION);
  });

  it.each([
    [2, 3],
    [1, 2],
    [0, 1],
  ])("rejects a sunbed spot with included/max %i/%i", async (included, max) => {
    const { areaId, lineId } = await baseLayout();
    await expectPgError(
      insertSpot({
        areaId,
        lineId,
        number: 1,
        position: 1,
        kind: "sunbed",
        includedSunbeds: included,
        maxSunbeds: max,
      }),
      CHECK_VIOLATION,
    );
  });

  it("accepts a sunbed spot with included/max 1/1", async () => {
    const { areaId, lineId } = await baseLayout();
    await expect(
      insertSpot({
        areaId,
        lineId,
        number: 1,
        position: 1,
        kind: "sunbed",
        includedSunbeds: 1,
        maxSunbeds: 1,
      }),
    ).resolves.toBeTypeOf("number");
  });

  it("rejects an unknown spot kind", async () => {
    const { areaId, lineId } = await baseLayout();
    await expectPgError(
      insertSpot({ areaId, lineId, number: 1, position: 1, kind: "cabana" }),
      INVALID_TEXT_REPRESENTATION,
    );
  });
});

describe("AC4: no cascading deletes", () => {
  it("refuses to delete a venue that has areas", async () => {
    const { venueId } = await baseLayout();
    await expectPgError(
      sql`delete from venue where id = ${venueId}`.execute(db),
      FOREIGN_KEY_VIOLATION,
    );
  });

  it("refuses to delete an area that has lines", async () => {
    const { areaId } = await baseLayout();
    await expectPgError(
      sql`delete from area where id = ${areaId}`.execute(db),
      FOREIGN_KEY_VIOLATION,
    );
  });

  it("refuses to delete a line that has spots", async () => {
    const { areaId, lineId } = await baseLayout();
    await insertSpot({ areaId, lineId, number: 1, position: 1 });
    await expectPgError(
      sql`delete from area_line where id = ${lineId}`.execute(db),
      FOREIGN_KEY_VIOLATION,
    );
  });

  it("deletes a line once it has no spots", async () => {
    const { lineId } = await baseLayout();
    const result = await sql`delete from area_line where id = ${lineId}`.execute(db);
    expect(Number(result.numAffectedRows)).toBe(1);
  });
});

describe("AC5: defaults and timestamps", () => {
  it("defaults a new umbrella to 2 included and 3 max sunbeds (ADR 0004)", async () => {
    const { areaId, lineId } = await baseLayout();
    const id = await insertSpot({ areaId, lineId, number: 1, position: 1, kind: "umbrella" });
    const { rows } = await sql<{ included_sunbeds: number; max_sunbeds: number }>`
      select included_sunbeds, max_sunbeds from spot where id = ${id}
    `.execute(db);
    expect(rows[0]).toEqual({ included_sunbeds: 2, max_sunbeds: 3 });
  });

  it("uses timestamptz for created_at and updated_at on every table", async () => {
    const { rows } = await sql<{ table_name: string; column_name: string; data_type: string }>`
      select table_name, column_name, data_type from information_schema.columns
      where table_schema = 'public'
        and table_name in ('venue', 'area', 'area_line', 'spot')
        and column_name in ('created_at', 'updated_at')
    `.execute(db);
    expect(rows).toHaveLength(TABLES.length * 2);
    for (const row of rows) expect(row.data_type).toBe("timestamp with time zone");
  });

  // Rows start with a fixed past updated_at, so "moved forward" does not depend on the clock.
  const PAST = "2000-01-01T00:00:00Z";

  it.each(TABLES)("moves %s.updated_at forward on UPDATE and keeps created_at", async (table) => {
    const { venueId, areaId, lineId } = await baseLayout();
    const spotId = await insertSpot({ areaId, lineId, number: 1, position: 1 });
    const ids = { venue: venueId, area: areaId, area_line: lineId, spot: spotId };
    const id = ids[table];
    const ref = sql.table(table);
    // Pin both timestamps with the trigger bypassed, or it would overwrite updated_at.
    await sql`alter table ${ref} disable trigger user`.execute(db);
    try {
      await sql`update ${ref} set created_at = ${PAST}, updated_at = ${PAST} where id = ${id}`.execute(
        db,
      );
    } finally {
      await sql`alter table ${ref} enable trigger user`.execute(db);
    }

    const change =
      table === "area_line"
        ? sql`update area_line set number = 2 where id = ${id}`
        : table === "spot"
          ? sql`update spot set position = 2 where id = ${id}`
          : sql`update ${ref} set name = 'Renamed' where id = ${id}`;
    await change.execute(db);

    const { rows } = await sql<{ created_at: Date; updated_at: Date }>`
      select created_at, updated_at from ${ref} where id = ${id}
    `.execute(db);
    const past = new Date(PAST).getTime();
    expect(rows[0]?.created_at.getTime()).toBe(past);
    expect(rows[0]?.updated_at.getTime()).toBeGreaterThan(past);
  });
});
