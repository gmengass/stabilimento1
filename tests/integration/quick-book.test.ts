import { sql, type Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, getDb } from "@/db/client";
import { runMigrations } from "@/db/migrator";
import type { DB } from "@/db/types";
import { addArea } from "@/lib/beach/edit";
import { loadBeach, setupBeach } from "@/lib/beach/layout";
import { createBooking, type CreateBookingInput } from "@/lib/booking/bookings";
import { createSeasonPass, releaseDays } from "@/lib/booking/passes";
import { suggestQuickBook, type QuickSuggestResult } from "@/lib/booking/quick-book";
import { createSeason, listSeasons } from "@/lib/booking/seasons";
import { savePrices } from "@/lib/pricing/price-list";
import { testDatabaseUrl } from "./test-database";

let db: Kysely<DB>;
let migrated = false;
let areaId: number;
/** Spot id by umbrella number. */
let spot: Record<number, number>;
const USER = "u-staff";
/** The fixed "today" for every call: no test depends on the real clock. */
const TODAY = "2027-07-01";
const START = "2027-07-10";
const END = "2027-07-12";

beforeAll(async () => {
  db = createDb(testDatabaseUrl());
  const result = await runMigrations(db, "up");
  if (result.error) throw result.error;
  migrated = true;
});

beforeEach(async () => {
  if (!migrated) throw new Error("migrations did not run; refusing to truncate");
  await sql`truncate venue, area, area_line, spot, season, booking, booking_spot, spot_day,
    "user" restart identity cascade`.execute(db);
  await db
    .insertInto("user")
    .values({ id: USER, name: "Anna", email: "anna@example.invalid", username: "anna" })
    .execute();
  await setupBeach(db, { venueName: "Lido", areaName: "Main", lines: 2, umbrellasPerLine: 5 });
  const beach = await loadBeach(db);
  if (!beach) throw new Error("no beach");
  areaId = beach.areaId;
  spot = Object.fromEntries(beach.lines.flatMap((l) => l.spots.map((s) => [s.number, s.id])));
});

afterAll(async () => {
  await db.destroy();
  await getDb().destroy();
});

function request(overrides: Record<string, unknown> = {}) {
  return { areaId, umbrellas: 1, sunbeds: 1, startDate: START, endDate: END, ...overrides };
}

function suggest(overrides: Record<string, unknown> = {}, today = TODAY) {
  return suggestQuickBook(db, request(overrides), today);
}

/** Umbrella numbers of every suggestion, in order. */
function numbers(result: QuickSuggestResult): number[][] {
  if (!result.ok) throw new Error(`expected suggestions, got ${result.error}`);
  return result.suggestions.map((s) => s.spots.map((spot) => spot.number));
}

async function book(numbers: number[], startDate: string, endDate: string): Promise<number> {
  const input: CreateBookingInput = {
    customerName: "Rossi",
    startDate,
    endDate,
    spots: numbers.map((n) => ({ spotId: spot[n], sunbeds: 1 })),
  };
  const result = await createBooking(db, USER, input, TODAY);
  if (!result.ok) throw new Error(`setup booking failed: ${result.error}`);
  return result.bookingId;
}

async function sellPass(number: number): Promise<number> {
  const season = { name: "Estate 2027", startDate: "2027-06-01", endDate: "2027-09-15" };
  if ((await listSeasons(db)).length === 0) {
    expect(await createSeason(db, season, "2027-05-01")).toEqual({ ok: true });
  }
  const seasonId = (await listSeasons(db))[0].id;
  const result = await createSeasonPass(
    db,
    USER,
    {
      seasonId,
      startDate: season.startDate,
      customerName: "Bianchi",
      customerPhone: "",
      spots: [{ spotId: spot[number], sunbeds: 2 }],
    },
    "2027-05-01",
  );
  if (!result.ok) throw new Error(`pass failed: ${result.error}`);
  return result.bookingId;
}

describe("suggestQuickBook", () => {
  it("suggests the first free adjacent umbrellas with the sunbeds spread over them", async () => {
    const result = await suggest({ umbrellas: 2, sunbeds: 5 });
    if (!result.ok) throw new Error("expected suggestions");
    expect(result.suggestions[0]).toEqual({
      layout: "adjacent",
      spots: [
        { spotId: spot[101], number: 101, sunbeds: 3 },
        { spotId: spot[102], number: 102, sunbeds: 2 },
      ],
    });
  });

  it("skips a booked umbrella instead of offering a pair across it", async () => {
    await book([102], START, END);
    const result = await suggest({ umbrellas: 2, sunbeds: 2 });
    expect(numbers(result)[0]).toEqual([103, 104]);
  });

  it("checks every day of the range, both ends included", async () => {
    await book([101], "2027-07-07", "2027-07-09"); // ends the day before: no clash
    await book([102], END, "2027-07-14"); // starts on the last day: clash
    await book([103], "2027-07-11", "2027-07-11"); // only a middle day: clash
    await book([104], "2027-07-08", "2027-07-10"); // ends on the first day: clash
    await book([105], "2027-07-13", "2027-07-15"); // starts the day after: no clash
    expect(numbers(await suggest())).toEqual([[101], [105], [201], [202], [203]]);
  });

  it("counts a day a season-pass holder released as free, but not a partly released range", async () => {
    const released = await sellPass(101);
    const partly = await sellPass(102);
    await sellPass(103);
    const all = { bookingId: released, startDate: START, endDate: END };
    expect(await releaseDays(db, USER, all, TODAY)).toEqual({ ok: true, days: 3 });
    const some = { bookingId: partly, startDate: START, endDate: "2027-07-11" };
    expect(await releaseDays(db, USER, some, TODAY)).toEqual({ ok: true, days: 2 });
    expect(numbers(await suggest())).toEqual([[101], [104], [105], [201], [202]]);
  });

  it("only suggests umbrellas, never single sunbed spots", async () => {
    await db
      .updateTable("spot")
      .set({ kind: "sunbed", included_sunbeds: 1, max_sunbeds: 1 })
      .where("id", "=", spot[101])
      .execute();
    expect(numbers(await suggest({ sunbeds: 0 }))[0]).toEqual([102]);
  });

  it("never suggests umbrellas of another beach space", async () => {
    const added = await addArea(db, { areaName: "North", lines: 1, umbrellasPerLine: 2 });
    if (!added.ok) throw new Error("setup failed");
    const north = await loadBeach(db, added.areaId);
    const northIds = new Set(north?.lines.flatMap((l) => l.spots.map((s) => s.id)));
    const mainIds = new Set(Object.values(spot));

    const inMain = await suggest();
    if (!inMain.ok) throw new Error("expected suggestions");
    for (const s of inMain.suggestions.flatMap((x) => x.spots)) {
      expect(mainIds.has(s.spotId)).toBe(true);
    }
    const inNorth = await suggest({ areaId: added.areaId });
    if (!inNorth.ok) throw new Error("expected suggestions");
    for (const s of inNorth.suggestions.flatMap((x) => x.spots)) {
      expect(northIds.has(s.spotId)).toBe(true);
    }
    // Main has ten free umbrellas, but North only two.
    expect(await suggest({ areaId: added.areaId, umbrellas: 3 })).toEqual({
      ok: false,
      error: "noFit",
      free: 2,
    });
  });

  it("reports noFit with the number of free umbrellas", async () => {
    await book([101, 102, 103, 104, 105, 201, 202, 203], START, START);
    expect(await suggest({ umbrellas: 3 })).toEqual({ ok: false, error: "noFit", free: 2 });
  });

  it("reports tooManySunbeds when the free umbrellas can't hold them", async () => {
    expect(await suggest({ umbrellas: 2, sunbeds: 7 })).toEqual({
      ok: false,
      error: "tooManySunbeds",
    });
  });

  it("refuses a range starting before today, but allows today", async () => {
    expect(await suggest({ startDate: "2027-06-30", endDate: END })).toEqual({
      ok: false,
      error: "past",
    });
    expect(await suggest({ startDate: TODAY, endDate: TODAY })).toMatchObject({ ok: true });
  });

  it("allows a range of 366 days", async () => {
    const yearLong = await suggest({ startDate: "2027-07-01", endDate: "2028-06-30" });
    expect(yearLong).toMatchObject({ ok: true });
  });

  it.each([
    ["no umbrellas", { umbrellas: 0 }],
    ["21 umbrellas", { umbrellas: 21 }],
    ["a fractional umbrella count", { umbrellas: 1.5 }],
    ["umbrellas as text", { umbrellas: "2" }],
    ["negative sunbeds", { sunbeds: -1 }],
    ["201 sunbeds", { sunbeds: 201 }],
    ["fractional sunbeds", { sunbeds: 0.5 }],
    ["end before start", { startDate: "2027-07-12", endDate: "2027-07-11" }],
    ["more than 366 days", { startDate: "2027-07-01", endDate: "2028-07-02" }],
    ["an impossible date", { startDate: "2027-02-30" }],
    ["a non-ISO date", { endDate: "12/07/2027" }],
    ["a missing end date", { endDate: undefined }],
    ["an area id as text", { areaId: "1" }],
  ])("rejects %s as invalid", async (_label, override) => {
    expect(await suggest(override)).toEqual({ ok: false, error: "invalid" });
  });

  it.each([null, undefined, "x", 42, []])("rejects input %o as invalid", async (input) => {
    expect(await suggestQuickBook(db, input, TODAY)).toEqual({ ok: false, error: "invalid" });
  });

  it("lets only one of two staff booking the same suggestion at once win", async () => {
    const result = await suggest({ umbrellas: 2, sunbeds: 4 });
    if (!result.ok) throw new Error("expected suggestions");
    const spots = result.suggestions[0].spots.map((s) => ({
      spotId: s.spotId,
      sunbeds: s.sunbeds,
    }));
    const input = (customerName: string): CreateBookingInput => ({
      customerName,
      startDate: START,
      endDate: END,
      spots,
    });

    const results = await Promise.all([
      createBooking(db, USER, input("Rossi"), TODAY),
      createBooking(db, USER, input("Verdi"), TODAY),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.error === "taken")).toHaveLength(1);
    const { rows } = await sql<{ bookings: number; days: number }>`
      select count(distinct bs.booking_id)::int as bookings, count(*)::int as days
      from spot_day sd join booking_spot bs on bs.id = sd.booking_spot_id`.execute(db);
    expect(rows[0]).toEqual({ bookings: 1, days: 6 });
    expect(numbers(await suggest({ umbrellas: 2, sunbeds: 4 }))[0]).toEqual([103, 104]);
  });
});

describe("quick book price (ADR 0029)", () => {
  async function withPrices() {
    const season = { name: "Estate 2027", startDate: "2027-06-01", endDate: "2027-09-15" };
    expect(await createSeason(db, season, "2027-05-01")).toEqual({ ok: true });
    const seasonId = (await listSeasons(db))[0].id;
    const rows = Array.from({ length: 31 }, (_, i) => ({
      days: i + 1,
      single: (i + 1) * 1000,
      bundle: (i + 1) * 2500,
    }));
    expect(await savePrices(db, { seasonId, rows })).toEqual({ ok: true });
  }

  it("prices what was asked for, deckchairs capped per umbrella", async () => {
    await withPrices();
    const result = await suggest({ umbrellas: 1, sunbeds: 2, deckchairs: 5 });
    if (!result.ok) throw new Error(result.error);
    const days = Math.round((Date.parse(END) - Date.parse(START)) / 86_400_000) + 1;
    // 1 umbrella + 2 sunbeds + 2 deckchairs = 5 pieces: one bundle and two singles.
    expect(result.price).toMatchObject({ pieces: 5, days, bundles: 1, singles: 2 });
  });

  it("has no price before the season's list is entered", async () => {
    const result = await suggest();
    if (!result.ok) throw new Error(result.error);
    expect(result.price).toBeNull();
  });
});
