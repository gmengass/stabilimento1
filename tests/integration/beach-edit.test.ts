import { sql, type Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, getDb } from "@/db/client";
import { runMigrations } from "@/db/migrator";
import type { DB } from "@/db/types";
import {
  addArea,
  addLine,
  addUmbrellas,
  removeArea,
  removeLastLine,
  removeSpot,
  renameArea,
  renameVenue,
  updateSpot,
} from "@/lib/beach/edit";
import { listAreas, loadBeach, setupBeach } from "@/lib/beach/layout";
import { createBooking } from "@/lib/booking/bookings";
import { testDatabaseUrl } from "./test-database";

let db: Kysely<DB>;
let migrated = false;
const USER = "u-admin";
let areaId: number;

beforeAll(async () => {
  db = createDb(testDatabaseUrl());
  const result = await runMigrations(db, "up");
  if (result.error) throw result.error;
  migrated = true;
});

beforeEach(async () => {
  if (!migrated) throw new Error("migrations did not run; refusing to truncate");
  await sql`truncate venue, area, area_line, spot, booking, booking_spot, spot_day,
    "user" restart identity cascade`.execute(db);
  await db
    .insertInto("user")
    .values({ id: USER, name: "Owner", email: "o@example.invalid", username: "owner" })
    .execute();
  await setupBeach(db, { venueName: "Lido", areaName: "Main", lines: 2, umbrellasPerLine: 3 });
  areaId = (await loadBeach(db))?.areaId ?? 0;
});

afterAll(async () => {
  await db.destroy();
  await getDb().destroy();
});

async function numbers(): Promise<number[][]> {
  const beach = await loadBeach(db);
  return beach?.lines.map((l) => l.spots.map((s) => s.number)) ?? [];
}

async function spotId(number: number): Promise<number> {
  const row = await db
    .selectFrom("spot")
    .select("id")
    .where("number", "=", number)
    .executeTakeFirstOrThrow();
  return row.id;
}

async function book(number: number): Promise<void> {
  const result = await createBooking(db, USER, {
    customerName: "Rossi",
    customerPhone: "333 1234567",
    startDate: "2027-07-10",
    endDate: "2027-07-10",
    spots: [{ spotId: await spotId(number), sunbeds: 2 }],
  });
  if (!result.ok) throw new Error("booking failed");
}

describe("no beach yet", () => {
  it("every edit reports noBeach", async () => {
    await sql`truncate venue, area, area_line, spot restart identity cascade`.execute(db);
    expect(await addLine(db, { areaId, umbrellas: 2 })).toEqual({ ok: false, error: "noBeach" });
    expect(await renameVenue(db, { venueName: "X" })).toEqual({ ok: false, error: "noBeach" });
  });
});

describe("renameVenue", () => {
  it("renames the club", async () => {
    expect(await renameVenue(db, { venueName: "  Lido Azzurro " })).toEqual({ ok: true });
    expect((await loadBeach(db))?.venueName).toBe("Lido Azzurro");
  });

  it("rejects an empty name", async () => {
    expect(await renameVenue(db, { venueName: " " })).toEqual({ ok: false, error: "invalid" });
  });
});

describe("lines", () => {
  it("adds a line behind the last one with default numbers", async () => {
    expect(await addLine(db, { areaId, umbrellas: "2" })).toEqual({ ok: true });
    expect(await numbers()).toEqual([
      [101, 102, 103],
      [201, 202, 203],
      [301, 302],
    ]);
  });

  it("adds umbrellas at the right-hand end of a line, after any gap", async () => {
    await removeSpot(db, { areaId, spotId: await spotId(102) });
    expect(await addUmbrellas(db, { areaId, lineNumber: 1, umbrellas: 2 })).toEqual({ ok: true });
    expect(await numbers()).toEqual([
      [101, 103, 104, 105],
      [201, 202, 203],
    ]);
  });

  it("refuses to go past 99 umbrellas in a line", async () => {
    expect(await addUmbrellas(db, { areaId, lineNumber: 1, umbrellas: 96 })).toEqual({ ok: true });
    expect(await addUmbrellas(db, { areaId, lineNumber: 1, umbrellas: 1 })).toEqual({
      ok: false,
      error: "lineFull",
    });
  });

  it("refuses to add to a line that does not exist", async () => {
    expect(await addUmbrellas(db, { areaId, lineNumber: 9, umbrellas: 1 })).toEqual({
      ok: false,
      error: "notFound",
    });
  });

  it("removes only the last line, with its umbrellas", async () => {
    expect(await removeLastLine(db, { areaId, lineNumber: 1 })).toEqual({
      ok: false,
      error: "notFound",
    });
    expect(await removeLastLine(db, { areaId, lineNumber: 2 })).toEqual({ ok: true });
    expect(await numbers()).toEqual([[101, 102, 103]]);
  });

  it("refuses to remove a line with a booked umbrella and changes nothing", async () => {
    await book(202);
    expect(await removeLastLine(db, { areaId, lineNumber: 2 })).toEqual({
      ok: false,
      error: "hasBookings",
    });
    expect(await numbers()).toEqual([
      [101, 102, 103],
      [201, 202, 203],
    ]);
  });

  it("refuses a default number that a renumbered umbrella already uses", async () => {
    await updateSpot(db, {
      areaId,
      spotId: await spotId(101),
      number: 301,
      includedSunbeds: 2,
      maxSunbeds: 3,
    });
    expect(await addLine(db, { areaId, umbrellas: 1 })).toEqual({
      ok: false,
      error: "numberTaken",
    });
    expect(await numbers()).toHaveLength(2);
  });
});

describe("single umbrellas", () => {
  it("changes number and sunbeds", async () => {
    const id = await spotId(102);
    expect(
      await updateSpot(db, {
        areaId,
        spotId: id,
        number: "150",
        includedSunbeds: "1",
        maxSunbeds: "4",
      }),
    ).toEqual({
      ok: true,
    });
    const spot = (await loadBeach(db))?.lines[0].spots[1];
    expect(spot).toMatchObject({ number: 150, includedSunbeds: 1, maxSunbeds: 4 });
  });

  it("refuses a number another umbrella has", async () => {
    const result = await updateSpot(db, {
      areaId,
      spotId: await spotId(102),
      number: 201,
      includedSunbeds: 2,
      maxSunbeds: 3,
    });
    expect(result).toEqual({ ok: false, error: "numberTaken" });
  });

  it.each([
    { includedSunbeds: 4, maxSunbeds: 3 },
    { includedSunbeds: 0, maxSunbeds: 0 },
    { includedSunbeds: 2, maxSunbeds: 7 },
    { number: 0 },
  ])("rejects %o", async (override) => {
    const result = await updateSpot(db, {
      areaId,
      spotId: await spotId(102),
      number: 102,
      includedSunbeds: 2,
      maxSunbeds: 3,
      ...override,
    });
    expect(result).toEqual({ ok: false, error: "invalid" });
  });

  it("removes an umbrella and leaves the gap", async () => {
    expect(await removeSpot(db, { areaId, spotId: await spotId(102) })).toEqual({ ok: true });
    const line = (await loadBeach(db))?.lines[0];
    expect(line?.spots.map((s) => s.position)).toEqual([1, 3]);
  });

  it("refuses a limit below the sunbeds of an upcoming booking, allows it once it has passed", async () => {
    await book(102);
    const id = await spotId(102);
    const lower = { areaId, spotId: id, number: 102, includedSunbeds: 1, maxSunbeds: 1 };
    expect(await updateSpot(db, lower, "2027-07-10")).toEqual({
      ok: false,
      error: "sunbedsInUse",
    });
    expect(await updateSpot(db, { ...lower, maxSunbeds: 2 }, "2027-07-10")).toEqual({
      ok: true,
    });
    expect(await updateSpot(db, lower, "2027-07-11")).toEqual({ ok: true });
  });

  it("refuses to remove a booked umbrella", async () => {
    await book(102);
    expect(await removeSpot(db, { areaId, spotId: await spotId(102) })).toEqual({
      ok: false,
      error: "hasBookings",
    });
  });

  it("reports notFound for an unknown umbrella", async () => {
    expect(await removeSpot(db, { areaId, spotId: 9999 })).toEqual({
      ok: false,
      error: "notFound",
    });
  });
});

describe("two admins at once", () => {
  it("add lines one after the other, never the same number", async () => {
    const results = await Promise.all([
      addLine(db, { areaId, umbrellas: 1 }),
      addLine(db, { areaId, umbrellas: 1 }),
    ]);
    expect(results).toEqual([{ ok: true }, { ok: true }]);
    expect(await numbers()).toEqual([[101, 102, 103], [201, 202, 203], [301], [401]]);
  });
});

describe("beach spaces", () => {
  it("adds a space after the others, with its own lines numbered from 101", async () => {
    const added = await addArea(db, {
      areaName: "Spiaggia Nord",
      lines: "2",
      umbrellasPerLine: "2",
    });
    expect(added).toMatchObject({ ok: true });
    if (!added.ok) return;
    expect((await listAreas(db)).map((a) => a.name)).toEqual(["Main", "Spiaggia Nord"]);
    const north = await loadBeach(db, added.areaId);
    expect(north?.areaName).toBe("Spiaggia Nord");
    expect(north?.lines.map((l) => l.spots.map((s) => s.number))).toEqual([
      [101, 102],
      [201, 202],
    ]);
    expect(await numbers()).toEqual([
      [101, 102, 103],
      [201, 202, 203],
    ]);
  });

  it("gives two spaces with the same name different slugs", async () => {
    await addArea(db, { areaName: "Main", lines: 1, umbrellasPerLine: 1 });
    const slugs = await db.selectFrom("area").select("slug").orderBy("id").execute();
    expect(slugs.map((s) => s.slug)).toEqual(["main", "main-2"]);
  });

  it("edits only the space it names", async () => {
    const added = await addArea(db, { areaName: "Nord", lines: 1, umbrellasPerLine: 2 });
    if (!added.ok) return;
    expect(await addLine(db, { areaId: added.areaId, umbrellas: 1 })).toEqual({ ok: true });
    expect(await numbers()).toEqual([
      [101, 102, 103],
      [201, 202, 203],
    ]);
    const mainSpot = await spotId(101);
    expect(await removeSpot(db, { areaId: added.areaId, spotId: mainSpot })).toEqual({
      ok: false,
      error: "notFound",
    });
  });

  it("falls back to the first space for an unknown id", async () => {
    expect((await loadBeach(db, 424242))?.areaName).toBe("Main");
  });

  it("renames a space", async () => {
    expect(await renameArea(db, { areaId, areaName: "Lido Sud" })).toEqual({ ok: true });
    expect((await loadBeach(db))?.areaName).toBe("Lido Sud");
  });

  it("removes a space with its umbrellas, but never the last one", async () => {
    expect(await removeArea(db, { areaId })).toEqual({ ok: false, error: "lastArea" });
    const added = await addArea(db, { areaName: "Nord", lines: 1, umbrellasPerLine: 2 });
    if (!added.ok) return;
    expect(await removeArea(db, { areaId: added.areaId })).toEqual({ ok: true });
    expect((await listAreas(db)).map((a) => a.name)).toEqual(["Main"]);
  });

  it("refuses to remove a space with a booked umbrella", async () => {
    await addArea(db, { areaName: "Nord", lines: 1, umbrellasPerLine: 2 });
    await book(101);
    expect(await removeArea(db, { areaId })).toEqual({ ok: false, error: "hasBookings" });
    expect(await listAreas(db)).toHaveLength(2);
  });

  it("allows at most 10 spaces", async () => {
    for (let i = 2; i <= 10; i++) {
      expect(await addArea(db, { areaName: `S${i}`, lines: 1, umbrellasPerLine: 1 })).toMatchObject(
        { ok: true },
      );
    }
    expect(await addArea(db, { areaName: "S11", lines: 1, umbrellasPerLine: 1 })).toEqual({
      ok: false,
      error: "tooManyAreas",
    });
  });
});
