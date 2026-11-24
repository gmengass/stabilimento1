import { sql, type Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, getDb } from "@/db/client";
import { runMigrations } from "@/db/migrator";
import type { DB } from "@/db/types";
import { loadBeach, setupBeach } from "@/lib/beach/layout";
import { createBooking, loadOccupancy } from "@/lib/booking/bookings";
import { createSeasonPass, releaseDays } from "@/lib/booking/passes";
import { createSeason, listSeasons } from "@/lib/booking/seasons";
import { listPrices, savePrices, type PriceEntry } from "@/lib/pricing/price-list";
import { testDatabaseUrl } from "./test-database";

let db: Kysely<DB>;
let migrated = false;
let areaId: number;
let spot: Record<number, number>;
let seasonId: number;
const USER = "u-staff";
const TODAY = "2027-05-01";

/** Made-up prices: €10 a piece a day, €27 a bundle a day, a season row of €300 / €800. */
function rows(): PriceEntry[] {
  const days: PriceEntry[] = Array.from({ length: 31 }, (_, i) => ({
    days: i + 1,
    single: (i + 1) * 1000,
    bundle: (i + 1) * 2700,
  }));
  return [...days, { days: null, single: 30_000, bundle: 80_000 }];
}

beforeAll(async () => {
  db = createDb(testDatabaseUrl());
  const result = await runMigrations(db, "up");
  if (result.error) throw result.error;
  migrated = true;
});

beforeEach(async () => {
  if (!migrated) throw new Error("migrations did not run; refusing to truncate");
  await sql`truncate venue, area, area_line, spot, season, price, booking, booking_spot, spot_day,
    audit_log, "user" restart identity cascade`.execute(db);
  await db
    .insertInto("user")
    .values({ id: USER, name: "Anna", email: "anna@example.invalid", username: "anna" })
    .execute();
  await setupBeach(db, { venueName: "Lido", areaName: "Main", lines: 2, umbrellasPerLine: 5 });
  const beach = await loadBeach(db);
  if (!beach) throw new Error("no beach");
  areaId = beach.areaId;
  spot = Object.fromEntries(beach.lines.flatMap((l) => l.spots.map((s) => [s.number, s.id])));
  const season = { name: "Estate 2027", startDate: "2027-06-01", endDate: "2027-09-15" };
  expect(await createSeason(db, season)).toEqual({ ok: true });
  seasonId = (await listSeasons(db))[0].id;
});

afterAll(async () => {
  await db.destroy();
  await getDb().destroy();
});

async function book(overrides: Record<string, unknown> = {}) {
  const result = await createBooking(
    db,
    USER,
    {
      customerName: "Rossi",
      customerPhone: "+39 333 1234567",
      startDate: "2027-07-10",
      endDate: "2027-07-17",
      spots: [{ spotId: spot[101], sunbeds: 3 }],
      ...overrides,
    },
    TODAY,
  );
  if (!result.ok) throw new Error(`booking failed: ${result.error}`);
  return result.bookingId;
}

async function priceOn(date: string, number = 101) {
  return (await loadOccupancy(db, areaId, date))[spot[number]]?.price;
}

describe("savePrices and listPrices", () => {
  it("stores a season's rows and lists them in order, season row last", async () => {
    expect(await savePrices(db, { seasonId, rows: rows().reverse() })).toEqual({ ok: true });
    const listed = await listPrices(db, seasonId);
    expect(listed).toHaveLength(32);
    expect(listed[0]).toEqual({ days: 1, single: 1000, bundle: 2700 });
    expect(listed[31]).toEqual({ days: null, single: 30_000, bundle: 80_000 });
  });

  it("replaces the whole list: rows left out are removed", async () => {
    await savePrices(db, { seasonId, rows: rows() });
    expect(await savePrices(db, { seasonId, rows: rows().slice(0, 2) })).toEqual({ ok: true });
    expect((await listPrices(db, seasonId)).map((r) => r.days)).toEqual([1, 2]);
  });

  it.each([
    ["a repeated row", [...rows().slice(0, 1), ...rows().slice(0, 1)]],
    ["a row for 32 days", [{ days: 32, single: 1, bundle: 1 }]],
    ["a negative price", [{ days: 1, single: -1, bundle: 1 }]],
    ["a fractional price", [{ days: 1, single: 1.5, bundle: 1 }]],
    ["a price over €100,000", [{ days: 1, single: 10_000_001, bundle: 1 }]],
  ])("refuses %s and keeps the list", async (_, bad) => {
    await savePrices(db, { seasonId, rows: rows() });
    expect(await savePrices(db, { seasonId, rows: bad })).toEqual({ ok: false, error: "invalid" });
    expect(await listPrices(db, seasonId)).toHaveLength(32);
  });

  it("refuses an unknown season", async () => {
    expect(await savePrices(db, { seasonId: 999, rows: rows() })).toEqual({
      ok: false,
      error: "notFound",
    });
  });
});

describe("the suggested price on the map", () => {
  it("prices an umbrella with 3 sunbeds for 8 days as a bundle and a piece", async () => {
    await savePrices(db, { seasonId, rows: rows() });
    await book();
    const price = await priceOn("2027-07-12");
    expect(price?.paid).toBeNull();
    expect(price?.suggestion).toMatchObject({
      pieces: 4,
      days: 8,
      totalCents: 8 * 2700 + 8 * 1000,
      discountCents: 4 * 8 * 1000 - (8 * 2700 + 8 * 1000),
    });
  });

  it("counts deckchairs and every umbrella", async () => {
    await savePrices(db, { seasonId, rows: rows() });
    await book({
      startDate: "2027-07-10",
      endDate: "2027-07-10",
      spots: [
        { spotId: spot[101], sunbeds: 2 },
        { spotId: spot[102], sunbeds: 1 },
      ],
      deckchairs: 1,
    });
    expect((await priceOn("2027-07-10"))?.suggestion).toMatchObject({ pieces: 6, days: 1 });
  });

  it("shows no price before the season's list is entered, or outside any season", async () => {
    await book();
    expect((await priceOn("2027-07-12"))?.suggestion).toBeNull();
    await savePrices(db, { seasonId, rows: rows() });
    await book({ startDate: "2027-10-01", endDate: "2027-10-02" });
    expect((await priceOn("2027-10-01"))?.suggestion).toBeNull();
  });

  it("prices a pass by its days less released ones, capped at the season row", async () => {
    await savePrices(db, { seasonId, rows: rows() });
    const sold = await createSeasonPass(
      db,
      USER,
      {
        seasonId,
        startDate: "2027-09-01",
        customerName: "Bianchi",
        customerPhone: "",
        spots: [{ spotId: spot[101], sunbeds: 0 }],
      },
      TODAY,
    );
    if (!sold.ok) throw new Error(sold.error);
    // 1 Sep to 15 Sep: 15 days of one piece, under the season cap.
    expect((await priceOn("2027-09-05"))?.suggestion).toMatchObject({
      days: 15,
      totalCents: 15_000,
    });
    await releaseDays(
      db,
      USER,
      { bookingId: sold.bookingId, startDate: "2027-09-10", endDate: "2027-09-11" },
      TODAY,
    );
    expect((await priceOn("2027-09-05"))?.suggestion).toMatchObject({
      days: 13,
      totalCents: 13_000,
    });
  });

  it("caps a whole-season pass at the season row", async () => {
    await savePrices(db, { seasonId, rows: rows() });
    const sold = await createSeasonPass(
      db,
      USER,
      {
        seasonId,
        startDate: "2027-06-01",
        customerName: "Bianchi",
        customerPhone: "",
        spots: [{ spotId: spot[101], sunbeds: 2 }],
      },
      TODAY,
    );
    if (!sold.ok) throw new Error(sold.error);
    expect((await priceOn("2027-07-01"))?.suggestion).toMatchObject({
      pieces: 3,
      days: 107,
      totalCents: 80_000,
    });
  });
});
