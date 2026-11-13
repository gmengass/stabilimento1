import { sql, type Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, getDb } from "@/db/client";
import { runMigrations } from "@/db/migrator";
import { seedDemo } from "@/db/seed-data";
import type { DB } from "@/db/types";
import { loadBeach, setupBeach } from "@/lib/beach/layout";
import { testDatabaseUrl } from "./test-database";

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

const input = {
  venueName: "Lido Azzurro",
  areaName: "Spiaggia",
  lines: "3",
  umbrellasPerLine: "4",
};

describe("loadBeach", () => {
  it("returns null on a fresh box", async () => {
    expect(await loadBeach(db)).toBeNull();
  });

  it("returns lines from the shore out, spots left to right", async () => {
    await seedDemo(db);
    const beach = await loadBeach(db);
    expect(beach?.lines.map((l) => l.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(beach?.lines[0].spots.map((s) => s.position)).toEqual(
      Array.from({ length: 18 }, (_, i) => i + 1),
    );
    expect(beach?.lines[1].spots[0]).toMatchObject({
      number: 201,
      kind: "umbrella",
      includedSunbeds: 2,
      maxSunbeds: 3,
    });
  });
});

describe("setupBeach", () => {
  it("creates the lines and default-numbered umbrellas", async () => {
    expect(await setupBeach(db, input)).toEqual({ ok: true });
    const beach = await loadBeach(db);
    expect(beach?.venueName).toBe("Lido Azzurro");
    expect(beach?.areaName).toBe("Spiaggia");
    expect(beach?.lines.map((l) => l.spots.map((s) => s.number))).toEqual([
      [101, 102, 103, 104],
      [201, 202, 203, 204],
      [301, 302, 303, 304],
    ]);
  });

  it("allows 99 umbrellas in a line (199 is the last default number)", async () => {
    expect(await setupBeach(db, { ...input, lines: 1, umbrellasPerLine: 99 })).toEqual({
      ok: true,
    });
    expect((await loadBeach(db))?.lines[0].spots.at(-1)?.number).toBe(199);
  });

  it.each([
    { venueName: "  " },
    { areaName: "" },
    { lines: 0 },
    { lines: 31 },
    { umbrellasPerLine: 0 },
    { umbrellasPerLine: 100 },
    { lines: "2.5" },
    { lines: "abc" },
  ])("rejects %o and writes nothing", async (override) => {
    expect(await setupBeach(db, { ...input, ...override })).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(await loadBeach(db)).toBeNull();
  });

  it("refuses when a beach exists, and leaves it untouched", async () => {
    await seedDemo(db);
    const before = await loadBeach(db);
    expect(await setupBeach(db, input)).toEqual({ ok: false, error: "exists" });
    expect(await loadBeach(db)).toEqual(before);
  });

  it("creates exactly one beach when two admins submit at once", async () => {
    const results = await Promise.all([setupBeach(db, input), setupBeach(db, input)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results).toContainEqual({ ok: false, error: "exists" });
    const { rows } = await sql<{ n: number }>`select count(*)::int as n from spot`.execute(db);
    expect(rows[0].n).toBe(12);
  });
});
