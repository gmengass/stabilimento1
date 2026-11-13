import { sql, type Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, getDb } from "@/db/client";
import { runMigrations } from "@/db/migrator";
import type { DB } from "@/db/types";
import { setupBeach, loadBeach } from "@/lib/beach/layout";
import { cancelBooking, createBooking, loadOccupancy, loadReleased } from "@/lib/booking/bookings";
import {
  createSeasonPass,
  releaseDays,
  restoreDays,
  type CreateSeasonPassInput,
} from "@/lib/booking/passes";
import {
  createSeason,
  listOpenSeasons,
  listSeasons,
  removeSeason,
  updateSeason,
} from "@/lib/booking/seasons";
import { testDatabaseUrl } from "./test-database";

let db: Kysely<DB>;
let migrated = false;
let areaId: number;
/** Spot id by umbrella number. */
let spot: Record<number, number>;
let seasonId: number;
const USER = "u-staff";
const TODAY = "2027-06-20";
const SEASON = { name: "Estate 2027", startDate: "2027-06-01", endDate: "2027-09-15" };
const SEASON_DAYS = 107;

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
  expect(await createSeason(db, SEASON)).toEqual({ ok: true });
  seasonId = (await listSeasons(db))[0].id;
});

afterAll(async () => {
  await db.destroy();
  await getDb().destroy();
});

function pass(overrides: Partial<CreateSeasonPassInput> = {}): CreateSeasonPassInput {
  return {
    seasonId,
    customerName: "Bianchi",
    customerPhone: "",
    spots: [{ spotId: spot[101], sunbeds: 2 }],
    ...overrides,
  };
}

async function sellPass(overrides: Partial<CreateSeasonPassInput> = {}): Promise<number> {
  const result = await createSeasonPass(db, USER, pass(overrides));
  if (!result.ok) throw new Error(`pass failed: ${result.error}`);
  return result.bookingId;
}

async function states(bookingId: number): Promise<Record<string, number>> {
  const { rows } = await sql<{ state: string; n: number }>`
    select sd.state, count(*)::int as n from spot_day sd
    join booking_spot bs on bs.id = sd.booking_spot_id
    where bs.booking_id = ${bookingId} group by sd.state
  `.execute(db);
  return Object.fromEntries(rows.map((r) => [r.state, r.n]));
}

describe("seasons", () => {
  it("lists seasons with their pass count", async () => {
    await sellPass();
    expect(await listSeasons(db)).toEqual([{ id: seasonId, ...SEASON, passes: 1 }]);
  });

  it.each([
    ["blank name", { ...SEASON, name: "  " }],
    ["end before start", { name: "X", startDate: "2028-06-02", endDate: "2028-06-01" }],
    ["longer than a year", { name: "X", startDate: "2028-01-01", endDate: "2029-01-01" }],
    ["impossible date", { name: "X", startDate: "2028-02-30", endDate: "2028-03-01" }],
  ])("rejects %s", async (_label, input) => {
    expect(await createSeason(db, input)).toEqual({ ok: false, error: "invalid" });
  });

  it("allows a one-day season and one exactly 366 days long", async () => {
    const day = { name: "Day", startDate: "2028-06-01", endDate: "2028-06-01" };
    expect(await createSeason(db, day)).toEqual({ ok: true });
    const year = { name: "Year", startDate: "2029-01-01", endDate: "2030-01-01" };
    expect(await createSeason(db, year)).toEqual({ ok: true });
  });

  it("refuses a season that shares a day with another, boundaries included", async () => {
    const overlap = { ok: false, error: "overlap" };
    for (const [startDate, endDate] of [
      ["2027-09-15", "2027-10-01"],
      ["2027-05-01", "2027-06-01"],
      ["2027-07-01", "2027-07-02"],
      ["2027-01-01", "2027-12-31"],
    ]) {
      expect(await createSeason(db, { name: "Other", startDate, endDate })).toEqual(overlap);
    }
    const next = { name: "Autumn", startDate: "2027-09-16", endDate: "2027-10-01" };
    expect(await createSeason(db, next)).toEqual({ ok: true });
  });

  it("refuses a duplicate name", async () => {
    const twin = { name: SEASON.name, startDate: "2028-06-01", endDate: "2028-09-15" };
    expect(await createSeason(db, twin)).toEqual({ ok: false, error: "nameTaken" });
  });

  it("lets only one of two overlapping seasons created at once succeed", async () => {
    const a = createSeason(db, { name: "A", startDate: "2028-06-01", endDate: "2028-09-01" });
    const b = createSeason(db, { name: "B", startDate: "2028-08-01", endDate: "2028-10-01" });
    const results = await Promise.all([a, b]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, error: "overlap" });
  });

  it("needs a beach first", async () => {
    await sql`truncate venue restart identity cascade`.execute(db);
    expect(await createSeason(db, SEASON)).toEqual({ ok: false, error: "noBeach" });
  });

  it("moves the dates of a season without passes, and renames one with passes", async () => {
    const moved = { seasonId, name: "Estate", startDate: "2027-05-25", endDate: "2027-09-20" };
    expect(await updateSeason(db, moved)).toEqual({ ok: true });
    await sellPass();
    expect(await updateSeason(db, { ...moved, name: "Summer" })).toEqual({ ok: true });
    expect(await updateSeason(db, { ...moved, endDate: "2027-09-30" })).toEqual({
      ok: false,
      error: "hasPasses",
    });
    expect((await listSeasons(db))[0]).toMatchObject({ name: "Summer", endDate: "2027-09-20" });
  });

  it("keeps the dates fixed even after the only pass is cancelled", async () => {
    const bookingId = await sellPass();
    await cancelBooking(db, USER, { bookingId }, TODAY);
    const moved = { seasonId, ...SEASON, endDate: "2027-09-30" };
    expect(await updateSeason(db, moved)).toEqual({ ok: false, error: "hasPasses" });
  });

  it("refuses to move a season onto another, and reports a missing one", async () => {
    const next = { name: "Autumn", startDate: "2027-09-16", endDate: "2027-10-01" };
    await createSeason(db, next);
    expect(await updateSeason(db, { seasonId, ...SEASON, endDate: "2027-09-16" })).toEqual({
      ok: false,
      error: "overlap",
    });
    expect(await updateSeason(db, { seasonId: 999, ...SEASON })).toEqual({
      ok: false,
      error: "notFound",
    });
  });

  it("removes a season without passes only", async () => {
    await sellPass();
    expect(await removeSeason(db, { seasonId })).toEqual({ ok: false, error: "hasPasses" });
    await createSeason(db, { name: "Next", startDate: "2028-06-01", endDate: "2028-09-15" });
    const next = (await listSeasons(db))[0];
    expect(await removeSeason(db, { seasonId: next.id })).toEqual({ ok: true });
    expect(await removeSeason(db, { seasonId: next.id })).toEqual({ ok: false, error: "notFound" });
  });

  it("lists open seasons: those not yet ended, the last day included", async () => {
    expect(await listOpenSeasons(db, "2027-09-15")).toHaveLength(1);
    expect(await listOpenSeasons(db, "2027-09-16")).toEqual([]);
  });
});

describe("createSeasonPass", () => {
  it("books every day of the season for every umbrella", async () => {
    const bookingId = await sellPass({
      spots: [
        { spotId: spot[101], sunbeds: 3 },
        { spotId: spot[102], sunbeds: 2 },
      ],
    });
    expect(await states(bookingId)).toEqual({ booked: SEASON_DAYS * 2 });
    const booking = await db
      .selectFrom("booking")
      .selectAll()
      .where("id", "=", bookingId)
      .executeTakeFirstOrThrow();
    expect(booking).toMatchObject({
      kind: "season",
      season_id: seasonId,
      start_date: SEASON.startDate,
      end_date: SEASON.endDate,
      customer_phone: null,
    });
    for (const date of [SEASON.startDate, SEASON.endDate]) {
      expect((await loadOccupancy(db, areaId, date))[spot[102]]).toMatchObject({
        kind: "season",
        customerName: "Bianchi",
        releasedDays: 0,
      });
    }
    expect(await loadOccupancy(db, areaId, "2027-05-31")).toEqual({});
    expect(await loadOccupancy(db, areaId, "2027-09-16")).toEqual({});
  });

  it("starts on the holder's first day when it is later than the opening", async () => {
    const bookingId = await sellPass({ startDate: "2027-09-14" });
    expect(await states(bookingId)).toEqual({ booked: 2 });
  });

  it("allows a first day on the season's first or last day, not outside", async () => {
    await sellPass({ startDate: SEASON.startDate });
    await sellPass({ startDate: SEASON.endDate, spots: [{ spotId: spot[102], sunbeds: 2 }] });
    for (const startDate of ["2027-05-31", "2027-09-16"]) {
      expect(await createSeasonPass(db, USER, pass({ startDate }))).toEqual({
        ok: false,
        error: "invalid",
      });
    }
  });

  it("rejects an unknown season, too many sunbeds and a missing name", async () => {
    const invalid = { ok: false, error: "invalid" };
    expect(await createSeasonPass(db, USER, pass({ seasonId: 999 }))).toEqual(invalid);
    expect(await createSeasonPass(db, USER, pass({ customerName: " " }))).toEqual(invalid);
    expect(
      await createSeasonPass(db, USER, pass({ spots: [{ spotId: spot[101], sunbeds: 4 }] })),
    ).toEqual({ ok: false, error: "sunbeds" });
  });

  it("fails whole when one day is taken, naming the clash", async () => {
    await createBooking(db, USER, {
      customerName: "Rossi",
      startDate: "2027-08-15",
      endDate: "2027-08-15",
      spots: [{ spotId: spot[101], sunbeds: 2 }],
    });
    expect(await createSeasonPass(db, USER, pass())).toEqual({
      ok: false,
      error: "taken",
      clashes: [{ spotNumber: 101, date: "2027-08-15" }],
    });
    expect((await listSeasons(db))[0].passes).toBe(0);
  });

  it("blocks a day booking on any day of the pass", async () => {
    await sellPass();
    const result = await createBooking(db, USER, {
      customerName: "Rossi",
      startDate: SEASON.endDate,
      endDate: "2027-09-16",
      spots: [{ spotId: spot[101], sunbeds: 2 }],
    });
    expect(result).toMatchObject({ ok: false, error: "taken" });
  });

  it("lets exactly one of two passes for the same umbrella win", async () => {
    const results = await Promise.all([
      createSeasonPass(db, USER, pass({ customerName: "A" })),
      createSeasonPass(db, USER, pass({ customerName: "B" })),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ error: "taken" });
    const { rows } = await sql<{ n: number }>`select count(*)::int as n from spot_day`.execute(db);
    expect(rows[0].n).toBe(SEASON_DAYS);
  });

  it("never leaves a pass outside its season when the dates move at the same moment", async () => {
    const moved = { seasonId, ...SEASON, startDate: "2027-06-10" };
    const [sold, update] = await Promise.all([
      createSeasonPass(db, USER, pass()),
      updateSeason(db, moved),
    ]);
    // Either the pass came first and pinned the dates, or the move came first and the pass
    // (asking for the old opening day by default) was refused or started on the new one.
    const season = (await listSeasons(db))[0];
    const outside = await db
      .selectFrom("booking")
      .select("id")
      .where((eb) =>
        eb.or([eb("start_date", "<", season.startDate), eb("end_date", ">", season.endDate)]),
      )
      .execute();
    expect(outside).toEqual([]);
    expect(sold.ok && update.ok).toBe(false);
  });

  it("is cancelled from today on, keeping the days already used", async () => {
    const bookingId = await sellPass();
    expect(await cancelBooking(db, USER, { bookingId }, TODAY)).toEqual({ ok: true });
    expect(await states(bookingId)).toEqual({ booked: 19 });
    expect(await loadOccupancy(db, areaId, TODAY)).toEqual({});
  });
});

describe("releaseDays", () => {
  it("frees every umbrella of the pass on the days, ends inclusive", async () => {
    const bookingId = await sellPass({
      spots: [
        { spotId: spot[101], sunbeds: 2 },
        { spotId: spot[102], sunbeds: 2 },
      ],
    });
    const range = { bookingId, startDate: "2027-07-10", endDate: "2027-07-12" };
    expect(await releaseDays(db, range, TODAY)).toEqual({ ok: true, days: 3 });
    expect(await states(bookingId)).toEqual({ booked: (SEASON_DAYS - 3) * 2, released: 6 });
    for (const date of ["2027-07-10", "2027-07-12"]) {
      expect(await loadOccupancy(db, areaId, date)).toEqual({});
      expect((await loadReleased(db, areaId, date))[spot[102]]).toMatchObject({
        bookingId,
        releasedDays: 3,
      });
    }
    for (const date of ["2027-07-09", "2027-07-13"]) {
      expect((await loadOccupancy(db, areaId, date))[spot[101]]).toMatchObject({
        releasedDays: 3,
      });
      expect(await loadReleased(db, areaId, date)).toEqual({});
    }
  });

  it("lets someone else book a released day, and only that day", async () => {
    const bookingId = await sellPass();
    await releaseDays(db, { bookingId, startDate: "2027-07-10", endDate: "2027-07-10" }, TODAY);
    const day = {
      customerName: "Rossi",
      startDate: "2027-07-10",
      endDate: "2027-07-10",
      spots: [{ spotId: spot[101], sunbeds: 2 }],
    };
    expect(await createBooking(db, USER, { ...day, endDate: "2027-07-11" })).toMatchObject({
      ok: false,
      error: "taken",
      clashes: [{ spotNumber: 101, date: "2027-07-11" }],
    });
    expect(await createBooking(db, USER, day)).toMatchObject({ ok: true });
    expect((await loadOccupancy(db, areaId, "2027-07-10"))[spot[101]]).toMatchObject({
      kind: "day",
      customerName: "Rossi",
    });
  });

  it("counts a day once, skips days already released or outside the pass", async () => {
    const bookingId = await sellPass();
    const range = { bookingId, startDate: "2027-09-14", endDate: "2027-09-20" };
    expect(await releaseDays(db, range, TODAY)).toEqual({ ok: true, days: 2 });
    expect(await releaseDays(db, range, TODAY)).toEqual({ ok: true, days: 0 });
  });

  it("releases today but not a past day", async () => {
    const bookingId = await sellPass();
    expect(await releaseDays(db, { bookingId, startDate: TODAY, endDate: TODAY }, TODAY)).toEqual({
      ok: true,
      days: 1,
    });
    const past = { bookingId, startDate: "2027-06-19", endDate: "2027-06-25" };
    expect(await releaseDays(db, past, TODAY)).toEqual({ ok: false, error: "past" });
  });

  it("refuses day bookings, cancelled passes and bad input", async () => {
    const day = await createBooking(db, USER, {
      customerName: "Rossi",
      startDate: "2027-07-10",
      endDate: "2027-07-12",
      spots: [{ spotId: spot[103], sunbeds: 2 }],
    });
    if (!day.ok) throw new Error("booking failed");
    const range = { startDate: "2027-07-10", endDate: "2027-07-11" };
    expect(await releaseDays(db, { bookingId: day.bookingId, ...range }, TODAY)).toEqual({
      ok: false,
      error: "notSeason",
    });
    const bookingId = await sellPass();
    await cancelBooking(db, USER, { bookingId }, TODAY);
    expect(await releaseDays(db, { bookingId, ...range }, TODAY)).toEqual({
      ok: false,
      error: "notFound",
    });
    expect(
      await releaseDays(db, { bookingId, startDate: "2027-07-11", endDate: "2027-07-10" }, TODAY),
    ).toEqual({ ok: false, error: "invalid" });
  });

  it("removes released future days too when the pass is cancelled", async () => {
    const bookingId = await sellPass();
    await releaseDays(db, { bookingId, startDate: "2027-07-10", endDate: "2027-07-12" }, TODAY);
    await cancelBooking(db, USER, { bookingId }, TODAY);
    expect(await states(bookingId)).toEqual({ booked: 19 });
  });
});

describe("restoreDays", () => {
  const range = { startDate: "2027-07-10", endDate: "2027-07-12" };

  it("takes free released days back", async () => {
    const bookingId = await sellPass();
    await releaseDays(db, { bookingId, ...range }, TODAY);
    const one = { bookingId, startDate: "2027-07-11", endDate: "2027-07-11" };
    expect(await restoreDays(db, one, TODAY)).toEqual({ ok: true, days: 1 });
    expect(await states(bookingId)).toEqual({ booked: SEASON_DAYS - 2, released: 2 });
    expect((await loadOccupancy(db, areaId, "2027-07-11"))[spot[101]]).toMatchObject({
      bookingId,
      releasedDays: 2,
    });
    expect(await restoreDays(db, one, TODAY)).toEqual({ ok: true, days: 0 });
  });

  it("changes nothing when one of the days was sold meanwhile", async () => {
    const bookingId = await sellPass();
    await releaseDays(db, { bookingId, ...range }, TODAY);
    await createBooking(db, USER, {
      customerName: "Rossi",
      startDate: "2027-07-12",
      endDate: "2027-07-12",
      spots: [{ spotId: spot[101], sunbeds: 2 }],
    });
    expect(await restoreDays(db, { bookingId, ...range }, TODAY)).toEqual({
      ok: false,
      error: "taken",
      clashes: [{ spotNumber: 101, date: "2027-07-12" }],
    });
    expect(await states(bookingId)).toEqual({ booked: SEASON_DAYS - 3, released: 3 });
    const free = { bookingId, startDate: "2027-07-10", endDate: "2027-07-11" };
    expect(await restoreDays(db, free, TODAY)).toEqual({ ok: true, days: 2 });
  });

  it("lets exactly one of a restore and a new booking for the same day win", async () => {
    const bookingId = await sellPass();
    const day = { startDate: "2027-07-10", endDate: "2027-07-10" };
    await releaseDays(db, { bookingId, ...day }, TODAY);
    const [restored, booked] = await Promise.all([
      restoreDays(db, { bookingId, ...day }, TODAY),
      createBooking(db, USER, {
        customerName: "Rossi",
        ...day,
        spots: [{ spotId: spot[101], sunbeds: 2 }],
      }),
    ]);
    expect([restored.ok, booked.ok].filter(Boolean)).toHaveLength(1);
    const { rows } = await sql<{ n: number }>`
      select count(*)::int as n from spot_day
      where date = '2027-07-10' and state = 'booked' and spot_id = ${spot[101]}
    `.execute(db);
    expect(rows[0].n).toBe(1);
  });

  it("refuses past days", async () => {
    const bookingId = await sellPass();
    const past = { bookingId, startDate: "2027-06-19", endDate: "2027-06-19" };
    expect(await restoreDays(db, past, TODAY)).toEqual({ ok: false, error: "past" });
  });
});
