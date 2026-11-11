import { sql, type Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, getDb } from "@/db/client";
import { runMigrations } from "@/db/migrator";
import type { DB } from "@/db/types";
import {
  addLine,
  addUmbrellas,
  removeLastLine,
  removeSpot,
  renameVenue,
  updateSpot,
} from "@/lib/beach/edit";
import { loadBeach, setupBeach } from "@/lib/beach/layout";
import { createBooking } from "@/lib/booking/bookings";
import { testDatabaseUrl } from "./test-database";

let db: Kysely<DB>;
let migrated = false;
const USER = "u-admin";

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
  await setupBeach(db, { venueName: "Lido", lines: 2, umbrellasPerLine: 3 });
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
    expect(await addLine(db, { umbrellas: 2 })).toEqual({ ok: false, error: "noBeach" });
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
    expect(await addLine(db, { umbrellas: "2" })).toEqual({ ok: true });
    expect(await numbers()).toEqual([
      [101, 102, 103],
      [201, 202, 203],
      [301, 302],
    ]);
  });

  it("adds umbrellas at the right-hand end of a line, after any gap", async () => {
    await removeSpot(db, { spotId: await spotId(102) });
    expect(await addUmbrellas(db, { lineNumber: 1, umbrellas: 2 })).toEqual({ ok: true });
    expect(await numbers()).toEqual([
      [101, 103, 104, 105],
      [201, 202, 203],
    ]);
  });

  it("refuses to go past 99 umbrellas in a line", async () => {
    expect(await addUmbrellas(db, { lineNumber: 1, umbrellas: 96 })).toEqual({ ok: true });
    expect(await addUmbrellas(db, { lineNumber: 1, umbrellas: 1 })).toEqual({
      ok: false,
      error: "lineFull",
    });
  });

  it("refuses to add to a line that does not exist", async () => {
    expect(await addUmbrellas(db, { lineNumber: 9, umbrellas: 1 })).toEqual({
      ok: false,
      error: "notFound",
    });
  });

  it("removes only the last line, with its umbrellas", async () => {
    expect(await removeLastLine(db, { lineNumber: 1 })).toEqual({ ok: false, error: "notFound" });
    expect(await removeLastLine(db, { lineNumber: 2 })).toEqual({ ok: true });
    expect(await numbers()).toEqual([[101, 102, 103]]);
  });

  it("refuses to remove a line with a booked umbrella and changes nothing", async () => {
    await book(202);
    expect(await removeLastLine(db, { lineNumber: 2 })).toEqual({
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
      spotId: await spotId(101),
      number: 301,
      includedSunbeds: 2,
      maxSunbeds: 3,
    });
    expect(await addLine(db, { umbrellas: 1 })).toEqual({ ok: false, error: "numberTaken" });
    expect(await numbers()).toHaveLength(2);
  });
});

describe("single umbrellas", () => {
  it("changes number and sunbeds", async () => {
    const id = await spotId(102);
    expect(
      await updateSpot(db, { spotId: id, number: "150", includedSunbeds: "1", maxSunbeds: "4" }),
    ).toEqual({
      ok: true,
    });
    const spot = (await loadBeach(db))?.lines[0].spots[1];
    expect(spot).toMatchObject({ number: 150, includedSunbeds: 1, maxSunbeds: 4 });
  });

  it("refuses a number another umbrella has", async () => {
    const result = await updateSpot(db, {
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
      spotId: await spotId(102),
      number: 102,
      includedSunbeds: 2,
      maxSunbeds: 3,
      ...override,
    });
    expect(result).toEqual({ ok: false, error: "invalid" });
  });

  it("removes an umbrella and leaves the gap", async () => {
    expect(await removeSpot(db, { spotId: await spotId(102) })).toEqual({ ok: true });
    const line = (await loadBeach(db))?.lines[0];
    expect(line?.spots.map((s) => s.position)).toEqual([1, 3]);
  });

  it("refuses to remove a booked umbrella", async () => {
    await book(102);
    expect(await removeSpot(db, { spotId: await spotId(102) })).toEqual({
      ok: false,
      error: "hasBookings",
    });
  });

  it("reports notFound for an unknown umbrella", async () => {
    expect(await removeSpot(db, { spotId: 9999 })).toEqual({ ok: false, error: "notFound" });
  });
});

describe("two admins at once", () => {
  it("add lines one after the other, never the same number", async () => {
    const results = await Promise.all([
      addLine(db, { umbrellas: 1 }),
      addLine(db, { umbrellas: 1 }),
    ]);
    expect(results).toEqual([{ ok: true }, { ok: true }]);
    expect(await numbers()).toEqual([[101, 102, 103], [201, 202, 203], [301], [401]]);
  });
});
