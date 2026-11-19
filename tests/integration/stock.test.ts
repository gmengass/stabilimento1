import { sql, type Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, getDb } from "@/db/client";
import { createMigrator, runMigrations } from "@/db/migrator";
import type { DB } from "@/db/types";
import { addDays } from "@/i18n/format";
import { addArea, setStock } from "@/lib/beach/edit";
import { loadBeach, setupBeach } from "@/lib/beach/layout";
import { createBooking, type CreateBookingInput } from "@/lib/booking/bookings";
import { checkIn } from "@/lib/booking/check-in";
import { applyHoldRule } from "@/lib/booking/hold";
import { moveBooking } from "@/lib/booking/move";
import { createSeasonPass, releaseDays } from "@/lib/booking/passes";
import { createSeason, listSeasons } from "@/lib/booking/seasons";
import { loadStockDay, overStock } from "@/lib/booking/stock";
import { testDatabaseUrl } from "./test-database";

let db: Kysely<DB>;
let migrated = false;
/** Spot id by umbrella number, in the first space. */
let spot: Record<number, number>;
let seasonId: number;
const TODAY = "2027-06-20";
const TOMORROW = addDays(TODAY, 1);
const USER = "u-anna";

const TRUNCATE = sql`truncate venue, area, area_line, spot, season, booking, booking_spot,
  spot_day, check_in, audit_log, "user" restart identity cascade`;

beforeAll(async () => {
  db = createDb(testDatabaseUrl());
  const result = await runMigrations(db, "up");
  if (result.error) throw result.error;
  migrated = true;
});

beforeEach(async () => {
  if (!migrated) throw new Error("migrations did not run; refusing to truncate");
  await TRUNCATE.execute(db);
  await db
    .insertInto("user")
    .values({ id: USER, name: "Anna", email: `${USER}@x.invalid`, username: "anna" })
    .execute();
  await setupBeach(db, { venueName: "Lido", areaName: "Main", lines: 2, umbrellasPerLine: 5 });
  const beach = await loadBeach(db);
  if (!beach) throw new Error("no beach");
  spot = Object.fromEntries(beach.lines.flatMap((l) => l.spots.map((s) => [s.number, s.id])));
  await createSeason(db, { name: "Estate 2027", startDate: "2027-06-01", endDate: "2027-09-15" });
  seasonId = (await listSeasons(db))[0].id;
});

afterAll(async () => {
  if (migrated) await TRUNCATE.execute(db);
  await db.destroy();
  await getDb().destroy();
});

function input(overrides: Partial<CreateBookingInput> = {}): CreateBookingInput {
  return {
    customerName: "Rossi",
    startDate: TODAY,
    endDate: TODAY,
    spots: [{ spotId: spot[101], sunbeds: 2 }],
    ...overrides,
  };
}

async function book(overrides: Partial<CreateBookingInput> = {}) {
  const result = await createBooking(
    db,
    USER,
    input({ ...overrides, allowOverStock: true }),
    TODAY,
  );
  if (!result.ok) throw new Error(`booking failed: ${result.error}`);
  return result.bookingId;
}

async function stock(sunbedStock: number | null, deckchairStock: number | null = null) {
  const result = await setStock(db, { sunbedStock, deckchairStock });
  if (!result.ok) throw new Error(`stock failed: ${result.error}`);
}

const bookingCount = async () =>
  Number(
    (
      await db
        .selectFrom("booking")
        .select(sql`count(*)`.as("n"))
        .executeTakeFirstOrThrow()
    ).n,
  );

describe("setStock", () => {
  it("starts untracked, saves numbers, answers old and new, and blank clears", async () => {
    expect(await loadStockDay(db, TODAY)).toEqual({ sunbeds: null, deckchairs: null });
    expect(await setStock(db, { sunbedStock: 20, deckchairStock: 4 })).toEqual({
      ok: true,
      from: { sunbedStock: null, deckchairStock: null },
      to: { sunbedStock: 20, deckchairStock: 4 },
    });
    expect((await loadBeach(db))?.sunbedStock).toBe(20);
    expect(await setStock(db, { sunbedStock: "", deckchairStock: 0 })).toEqual({
      ok: true,
      from: { sunbedStock: 20, deckchairStock: 4 },
      to: { sunbedStock: null, deckchairStock: 0 },
    });
    expect(await loadStockDay(db, TODAY)).toEqual({
      sunbeds: null,
      deckchairs: { free: 0, total: 0 },
    });
  });

  it.each([-1, 1.5, 10_000, "12", "x", true, undefined])("rejects %s", async (value) => {
    expect(await setStock(db, { sunbedStock: value, deckchairStock: null })).toEqual({
      ok: false,
      error: "invalid",
    });
    expect((await loadBeach(db))?.sunbedStock).toBeNull();
  });

  it("accepts the limits 0 and 9999", async () => {
    expect((await setStock(db, { sunbedStock: 0, deckchairStock: 9999 })).ok).toBe(true);
  });

  it("is refused by the database outside 0..9999", async () => {
    await expect(sql`update venue set sunbed_stock = 10000`.execute(db)).rejects.toMatchObject({
      code: "23514",
    });
  });
});

describe("loadStockDay", () => {
  it("subtracts the sunbeds and deckchairs booked that day, across every space", async () => {
    await stock(20, 4);
    const north = await addArea(db, { areaName: "North", lines: 1, umbrellasPerLine: 2 });
    if (!north.ok) throw new Error("no area");
    const northSpot = (await loadBeach(db, north.areaId))!.lines[0].spots[0].id;
    await book({
      spots: [
        { spotId: spot[101], sunbeds: 3 },
        { spotId: spot[102], sunbeds: 1 },
      ],
      deckchairs: 2,
    });
    await book({ spots: [{ spotId: northSpot, sunbeds: 2 }], deckchairs: 1 });
    expect(await loadStockDay(db, TODAY)).toEqual({
      sunbeds: { free: 14, total: 20 },
      deckchairs: { free: 1, total: 4 },
    });
  });

  it("counts a booking only on its own days (range boundaries)", async () => {
    await stock(10, 2);
    await book({ startDate: TOMORROW, endDate: addDays(TODAY, 2), deckchairs: 2 });
    const free = async (date: string) => (await loadStockDay(db, date)).sunbeds?.free;
    expect(await free(TODAY)).toBe(10);
    expect(await free(TOMORROW)).toBe(8);
    expect(await free(addDays(TODAY, 2))).toBe(8);
    expect(await free(addDays(TODAY, 3))).toBe(10);
  });

  it("goes below 0 when over the stock", async () => {
    await stock(1, 0);
    await book({ deckchairs: 1 });
    expect(await loadStockDay(db, TODAY)).toEqual({
      sunbeds: { free: -1, total: 1 },
      deckchairs: { free: -1, total: 0 },
    });
  });

  it("frees the stock of released days and no-shows", async () => {
    await stock(10);
    const pass = await createSeasonPass(
      db,
      USER,
      {
        seasonId,
        startDate: TODAY,
        customerName: "Bianchi",
        spots: [{ spotId: spot[201], sunbeds: 2 }],
      },
      TODAY,
    );
    if (!pass.ok) throw new Error("no pass");
    await releaseDays(
      db,
      USER,
      { bookingId: pass.bookingId, startDate: TOMORROW, endDate: TOMORROW },
      TODAY,
    );
    expect((await loadStockDay(db, TOMORROW)).sunbeds?.free).toBe(10);

    await book({ spots: [{ spotId: spot[101], sunbeds: 2 }] });
    const kept = await book({ spots: [{ spotId: spot[102], sunbeds: 2 }] });
    await checkIn(db, USER, { bookingId: kept, date: TODAY }, TODAY);
    await applyHoldRule(db, new Date(`${TODAY}T12:00:00+02:00`));
    // The pass (never freed) and the checked-in booking stay; the no-show gives its 2 back.
    expect((await loadStockDay(db, TODAY)).sunbeds?.free).toBe(6);
  });
});

describe("booking over the stock", () => {
  it("never warns while nothing is tracked", async () => {
    const result = await createBooking(
      db,
      USER,
      input({ spots: [{ spotId: spot[101], sunbeds: 3 }] }),
      TODAY,
    );
    expect(result.ok).toBe(true);
  });

  it("saves exactly at the stock without a warning", async () => {
    await stock(4, 2);
    const result = await createBooking(
      db,
      USER,
      input({
        spots: [
          { spotId: spot[101], sunbeds: 2 },
          { spotId: spot[102], sunbeds: 2 },
        ],
        deckchairs: 2,
      }),
      TODAY,
    );
    expect(result.ok).toBe(true);
  });

  it("warns with the days over, writes nothing, then saves when allowed", async () => {
    await stock(3);
    await book({
      startDate: TOMORROW,
      endDate: TOMORROW,
      spots: [{ spotId: spot[105], sunbeds: 2 }],
    });
    const request = input({ startDate: TODAY, endDate: addDays(TODAY, 2) });
    expect(await createBooking(db, USER, request, TODAY)).toEqual({
      ok: false,
      error: "stock",
      days: [{ date: TOMORROW, sunbeds: 1, deckchairs: 0 }],
    });
    expect(await bookingCount()).toBe(1);
    const spotDays = await db.selectFrom("spot_day").select("id").execute();
    expect(spotDays).toHaveLength(1);
    const audit = await db.selectFrom("audit_log").select("id").execute();
    expect(audit).toHaveLength(1);

    const saved = await createBooking(db, USER, { ...request, allowOverStock: true }, TODAY);
    expect(saved.ok).toBe(true);
    expect((await loadStockDay(db, TOMORROW)).sunbeds).toEqual({ free: -1, total: 3 });
  });

  it("warns about deckchairs only for a booking that asks for them", async () => {
    await stock(null, 1);
    await book({ deckchairs: 2 });
    const without = await createBooking(
      db,
      USER,
      input({ spots: [{ spotId: spot[102], sunbeds: 2 }] }),
      TODAY,
    );
    expect(without.ok).toBe(true);
    const withOne = await createBooking(
      db,
      USER,
      input({ spots: [{ spotId: spot[103], sunbeds: 2 }], deckchairs: 1 }),
      TODAY,
    );
    expect(withOne).toEqual({
      ok: false,
      error: "stock",
      days: [{ date: TODAY, sunbeds: 0, deckchairs: 2 }],
    });
  });

  it("does not warn about sunbeds for a booking with none", async () => {
    await stock(0);
    const result = await createBooking(
      db,
      USER,
      input({ spots: [{ spotId: spot[101], sunbeds: 0 }] }),
      TODAY,
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a non-boolean allowOverStock", async () => {
    const result = await createBooking(db, USER, { ...input(), allowOverStock: "yes" }, TODAY);
    expect(result).toEqual({ ok: false, error: "invalid" });
  });

  it("warns about a season pass over the stock on its days", async () => {
    await stock(1);
    const pass = {
      seasonId,
      startDate: "2027-09-14",
      customerName: "Bianchi",
      spots: [{ spotId: spot[201], sunbeds: 2 }],
    };
    expect(await createSeasonPass(db, USER, pass, TODAY)).toEqual({
      ok: false,
      error: "stock",
      days: [
        { date: "2027-09-14", sunbeds: 1, deckchairs: 0 },
        { date: "2027-09-15", sunbeds: 1, deckchairs: 0 },
      ],
    });
    expect(await bookingCount()).toBe(0);
    expect((await createSeasonPass(db, USER, { ...pass, allowOverStock: true }, TODAY)).ok).toBe(
      true,
    );
  });

  it("never refuses both of two desks booking the last sunbeds at once", async () => {
    await stock(2);
    const results = await Promise.all([
      createBooking(db, USER, input({ spots: [{ spotId: spot[101], sunbeds: 2 }] }), TODAY),
      createBooking(db, USER, input({ spots: [{ spotId: spot[102], sunbeds: 2 }] }), TODAY),
    ]);
    // A warning, not a lock (ADR 0021): both may pass, but never both refused.
    expect(results.filter((r) => r.ok).length).toBeGreaterThanOrEqual(1);
  });
});

describe("moving over the stock", () => {
  it("warns when new dates go over, moves nothing, then moves when allowed", async () => {
    await stock(2, 1);
    await book({
      startDate: TOMORROW,
      endDate: TOMORROW,
      spots: [{ spotId: spot[201], sunbeds: 2 }],
    });
    const id = await book({ deckchairs: 1, spots: [{ spotId: spot[101], sunbeds: 1 }] });
    await stock(2, 0);
    const move = {
      bookingId: id,
      spots: [{ fromSpotId: spot[101], toSpotId: spot[101] }],
      startDate: TOMORROW,
      endDate: TOMORROW,
    };
    expect(await moveBooking(db, USER, move, TODAY)).toEqual({
      ok: false,
      error: "stock",
      days: [{ date: TOMORROW, sunbeds: 1, deckchairs: 1 }],
    });
    const booking = await db
      .selectFrom("booking")
      .select("start_date")
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
    expect(booking.start_date).toBe(TODAY);
    expect(await moveBooking(db, USER, { ...move, allowOverStock: true }, TODAY)).toEqual({
      ok: true,
    });
  });

  it("does not warn about deckchairs on new dates for a booking with none", async () => {
    await stock(null, 0);
    await book({
      startDate: TOMORROW,
      endDate: TOMORROW,
      spots: [{ spotId: spot[201], sunbeds: 2 }],
      deckchairs: 1,
    });
    const id = await book();
    const moved = await moveBooking(
      db,
      USER,
      {
        bookingId: id,
        spots: [{ fromSpotId: spot[101], toSpotId: spot[101] }],
        startDate: TOMORROW,
        endDate: TOMORROW,
      },
      TODAY,
    );
    expect(moved).toEqual({ ok: true });
  });

  it("never warns on a move that keeps the dates", async () => {
    await stock(0, 0);
    const id = await book({ deckchairs: 1 });
    const moved = await moveBooking(
      db,
      USER,
      { bookingId: id, spots: [{ fromSpotId: spot[101], toSpotId: spot[103] }], fromDate: TODAY },
      TODAY,
    );
    expect(moved).toEqual({ ok: true });
  });
});

describe("logging an override", () => {
  it("records the days over on the book entry when saved anyway, and nothing otherwise", async () => {
    await stock(1);
    await createBooking(
      db,
      USER,
      input({ startDate: TODAY, endDate: TOMORROW, allowOverStock: true }),
      TODAY,
    );
    await createBooking(db, USER, input({ spots: [{ spotId: spot[102], sunbeds: 0 }] }), TODAY);
    const details = await db.selectFrom("audit_log").select("detail").orderBy("id").execute();
    expect(details.map((d) => d.detail)).toEqual([{ overStockDays: 2 }, {}]);
  });

  it("records the days over on a move to new dates saved anyway", async () => {
    await stock(1);
    await book({
      startDate: TOMORROW,
      endDate: TOMORROW,
      spots: [{ spotId: spot[201], sunbeds: 1 }],
    });
    const id = await book({ spots: [{ spotId: spot[101], sunbeds: 1 }] });
    const moved = await moveBooking(
      db,
      USER,
      {
        bookingId: id,
        spots: [{ fromSpotId: spot[101], toSpotId: spot[101] }],
        startDate: TOMORROW,
        endDate: TOMORROW,
        allowOverStock: true,
      },
      TODAY,
    );
    expect(moved).toEqual({ ok: true });
    const entry = await db
      .selectFrom("audit_log")
      .select("detail")
      .where("action", "=", "move")
      .executeTakeFirstOrThrow();
    expect(entry.detail).toMatchObject({ overStockDays: 1 });
  });
});

describe("overStock", () => {
  it("checks nothing for a booking that uses no stock", async () => {
    await stock(0, 0);
    await book({ deckchairs: 1 });
    expect(await overStock(db, TODAY, TODAY, { sunbeds: false, deckchairs: false })).toEqual([]);
  });
});

describe("0012_venue_stock migration", () => {
  it("rolls back and up again; existing venues read untracked", async () => {
    await stock(20, 4);
    try {
      const down = await createMigrator(db).migrateTo("0011_booking_deckchairs");
      if (down.error) throw down.error;
      const { rows } = await sql<{
        n: number;
      }>`select count(*)::int as n from information_schema.columns
        where table_name = 'venue' and column_name in ('sunbed_stock', 'deckchair_stock')`.execute(
        db,
      );
      expect(rows[0].n).toBe(0);
    } finally {
      const up = await runMigrations(db, "up");
      if (up.error) throw up.error;
    }
    expect(await loadStockDay(db, TODAY)).toEqual({ sunbeds: null, deckchairs: null });
  });
});
