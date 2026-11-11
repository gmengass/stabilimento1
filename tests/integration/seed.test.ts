import { sql, type Kysely } from "kysely";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, getDb } from "@/db/client";
import { runMigrations } from "@/db/migrator";
import { seedDemo } from "@/db/seed-data";
import type { DB } from "@/db/types";
import { testDatabaseUrl } from "./test-database";

const LINES = 6;
const SPOTS_PER_LINE = 20;

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

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await db.destroy();
  await getDb().destroy();
});

interface Snapshot {
  venues: number[];
  areas: number[];
  lines: number[];
  spots: number[];
}

async function ids(table: string): Promise<number[]> {
  const { rows } = await sql<{ id: number }>`
    select id from ${sql.table(table)} order by id
  `.execute(db);
  return rows.map((r) => r.id);
}

async function snapshot(): Promise<Snapshot> {
  return {
    venues: await ids("venue"),
    areas: await ids("area"),
    lines: await ids("area_line"),
    spots: await ids("spot"),
  };
}

interface SpotRow {
  line_number: number;
  position: number;
  number: number;
  kind: string;
  included_sunbeds: number;
  max_sunbeds: number;
}

async function demoSpots(): Promise<SpotRow[]> {
  const { rows } = await sql<SpotRow>`
    select l.number as line_number, s.position, s.number, s.kind::text as kind,
           s.included_sunbeds, s.max_sunbeds
    from spot s
    join area_line l on l.id = s.line_id
    join area a on a.id = s.area_id
    join venue v on v.id = a.venue_id
    where v.slug = 'lido-demo' and a.slug = 'main'
    order by l.number, s.position
  `.execute(db);
  return rows;
}

function expectedSpots(): SpotRow[] {
  const spots: SpotRow[] = [];
  for (let line = 1; line <= LINES; line++) {
    for (let position = 1; position <= SPOTS_PER_LINE; position++) {
      spots.push({
        line_number: line,
        position,
        number: line * 100 + position,
        kind: "umbrella",
        included_sunbeds: 2,
        max_sunbeds: 3,
      });
    }
  }
  return spots;
}

describe("AC6: demo seed", () => {
  it("loads one venue, one area, 6 lines and 120 default umbrellas numbered line × 100 + position", async () => {
    await seedDemo(db);

    const venues = await sql<{ slug: string }>`select slug from venue`.execute(db);
    expect(venues.rows.map((r) => r.slug)).toEqual(["lido-demo"]);

    const areas = await sql<{ slug: string }>`select slug from area`.execute(db);
    expect(areas.rows.map((r) => r.slug)).toEqual(["main"]);

    const lines = await sql<{ number: number }>`
      select number from area_line order by number
    `.execute(db);
    expect(lines.rows.map((r) => r.number)).toEqual([1, 2, 3, 4, 5, 6]);

    const spots = await demoSpots();
    expect(spots).toHaveLength(LINES * SPOTS_PER_LINE);
    expect(spots).toEqual(expectedSpots());
    const numbers = spots.map((s) => s.number);
    expect(numbers.slice(0, 2)).toEqual([101, 102]);
    expect(numbers[SPOTS_PER_LINE - 1]).toBe(120);
    expect(numbers[SPOTS_PER_LINE]).toBe(201);
    expect(numbers.at(-1)).toBe(620);
  });

  it("gives the same row counts and ids on a second run", async () => {
    await seedDemo(db);
    const first = await snapshot();
    await seedDemo(db);
    expect(await snapshot()).toEqual(first);
    expect(first.spots).toHaveLength(LINES * SPOTS_PER_LINE);
  });

  it("keeps a hand-added spot on a re-run", async () => {
    await seedDemo(db);
    const { rows } = await sql<{ area_id: number; line_id: number }>`
      select l.area_id, l.id as line_id from area_line l
      join area a on a.id = l.area_id
      where a.slug = 'main' and l.number = 6
    `.execute(db);
    const line6 = rows[0];
    if (!line6) throw new Error("seed did not create line 6");
    const added = await sql<{ id: number }>`
      insert into spot (area_id, line_id, number, position, kind)
      values (${line6.area_id}, ${line6.line_id}, 621, 21, 'umbrella')
      returning id
    `.execute(db);
    const addedId = added.rows[0]?.id;

    await seedDemo(db);

    const survivor = await sql<{ id: number; number: number; position: number }>`
      select id, number, position from spot where number = 621
    `.execute(db);
    expect(survivor.rows).toEqual([{ id: addedId, number: 621, position: 21 }]);
    expect(await ids("spot")).toHaveLength(LINES * SPOTS_PER_LINE + 1);
  });

  it("refuses to run when NODE_ENV is production and writes nothing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(seedDemo(db)).rejects.toThrow(Error);
    vi.unstubAllEnvs();
    expect(await snapshot()).toEqual({ venues: [], areas: [], lines: [], spots: [] });
  });
});
