import { sql, type Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, getDb } from "@/db/client";
import { runMigrations } from "@/db/migrator";
import type { DB } from "@/db/types";
import { addDays } from "@/i18n/format";
import { addArea, updateSpot } from "@/lib/beach/edit";
import { loadBeach, setupBeach } from "@/lib/beach/layout";
import { cancelBooking, createBooking, type CreateBookingInput } from "@/lib/booking/bookings";
import { checkIn, setHold } from "@/lib/booking/check-in";
import { loadDayCounts } from "@/lib/booking/counts";
import { applyHoldRule } from "@/lib/booking/hold";
import { moveBooking } from "@/lib/booking/move";
import { createSeasonPass, releaseDays } from "@/lib/booking/passes";
import { createSeason, listSeasons } from "@/lib/booking/seasons";
import { testDatabaseUrl } from "./test-database";

let db: Kysely<DB>;
let migrated = false;
let areaId: number;
/** Spot id by umbrella number. */
let spot: Record<number, number>;
let seasonId: number;
/** A Sunday in summer: Europe/Rome is UTC+2. */
const TODAY = "2027-06-20";
const YESTERDAY = addDays(TODAY, -1);
const TOMORROW = addDays(TODAY, 1);
const USER = "u-anna";

const TRUNCATE = sql`truncate venue, area, area_line, spot, season, booking, booking_spot,
  spot_day, check_in, audit_log, "user" restart identity cascade`;

/** A wall-clock time in Rome on a summer day, as a UTC instant (written out, not computed). */
const rome = (time: string, date = TODAY) => new Date(`${date}T${time}+02:00`);

/** The default beach: 2 lines × 5 umbrellas, 2 included sunbeds each. */
const EMPTY = { umbrellas: { free: 10, total: 10 }, sunbeds: { free: 20, total: 20 } };

/** Counts with `n` default umbrellas taken and nothing else changed. */
const taken = (n: number) => ({
  umbrellas: { free: 10 - n, total: 10 },
  sunbeds: { free: 20 - 2 * n, total: 20 },
});

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
  areaId = beach.areaId;
  spot = Object.fromEntries(beach.lines.flatMap((l) => l.spots.map((s) => [s.number, s.id])));
  await createSeason(db, { name: "Estate 2027", startDate: "2027-06-01", endDate: "2027-09-15" });
  seasonId = (await listSeasons(db))[0].id;
});

afterAll(async () => {
  // 0009's down refuses while check-ins or no-shows exist; db.test.ts rolls back.
  if (migrated) await TRUNCATE.execute(db);
  await db.destroy();
  await getDb().destroy();
});

async function book(overrides: Partial<CreateBookingInput> = {}, today = TODAY) {
  const input: CreateBookingInput = {
    customerName: "Rossi",
    customerPhone: "",
    startDate: TODAY,
    endDate: TODAY,
    spots: [{ spotId: spot[101], sunbeds: 2 }],
    ...overrides,
  };
  const result = await createBooking(db, USER, input, today);
  if (!result.ok) throw new Error(`booking failed: ${result.error}`);
  return result.bookingId;
}

async function sellPass(umbrella = 201) {
  const result = await createSeasonPass(
    db,
    USER,
    {
      seasonId,
      startDate: TODAY,
      customerName: "Bianchi",
      spots: [{ spotId: spot[umbrella], sunbeds: 2 }],
    },
    TODAY,
  );
  if (!result.ok) throw new Error(`pass failed: ${result.error}`);
  return result.bookingId;
}

/** Makes umbrellas into standalone sunbed spots (none at launch, ADR 0004). */
async function makeSunbedSpots(...numbers: number[]) {
  await db
    .updateTable("spot")
    .set({ kind: "sunbed", included_sunbeds: 1, max_sunbeds: 1 })
    .where(
      "id",
      "in",
      numbers.map((n) => spot[n]),
    )
    .execute();
}

const counts = (date = TODAY, area = areaId) => loadDayCounts(db, area, date);

describe("loadDayCounts: plain bookings", () => {
  it("shows everything free on an empty space", async () => {
    expect(await counts()).toEqual(EMPTY);
  });

  it("takes each umbrella of a booking and its included sunbeds", async () => {
    await book({
      spots: [
        { spotId: spot[101], sunbeds: 2 },
        { spotId: spot[102], sunbeds: 1 },
      ],
    });
    expect(await counts()).toEqual(taken(2));
  });

  it("counts only the booking's own days (range boundaries)", async () => {
    await book({ startDate: TOMORROW, endDate: addDays(TODAY, 3) });
    expect(await counts(TODAY)).toEqual(EMPTY);
    expect(await counts(TOMORROW)).toEqual(taken(1));
    expect(await counts(addDays(TODAY, 3))).toEqual(taken(1));
    expect(await counts(addDays(TODAY, 4))).toEqual(EMPTY);
  });

  it("is all free on a date outside any season", async () => {
    await sellPass();
    expect(await counts("2027-12-01")).toEqual(EMPTY);
    expect(await counts("2027-05-31")).toEqual(EMPTY);
  });

  it("ignores other beach spaces both ways", async () => {
    const added = await addArea(db, { areaName: "North", lines: 1, umbrellasPerLine: 2 });
    if (!added.ok) throw new Error("setup failed");
    const north = await loadBeach(db, added.areaId);
    const northSpot = north?.lines[0].spots[0].id ?? 0;
    await book({ spots: [{ spotId: northSpot, sunbeds: 2 }] });
    expect(await counts()).toEqual(EMPTY);
    expect(await counts(TODAY, added.areaId)).toEqual({
      umbrellas: { free: 1, total: 2 },
      sunbeds: { free: 2, total: 4 },
    });
  });
});

describe("loadDayCounts: sunbeds", () => {
  it("takes an umbrella's included sunbeds, not the booked number (owner rule)", async () => {
    await book({ spots: [{ spotId: spot[101], sunbeds: 3 }] });
    expect(await counts()).toEqual(taken(1));
  });

  it("uses each umbrella's own included sunbeds", async () => {
    const changed = await updateSpot(
      db,
      { areaId, spotId: spot[101], number: 101, includedSunbeds: 3, maxSunbeds: 3 },
      TODAY,
    );
    if (!changed.ok) throw new Error(`setup failed: ${changed.error}`);
    expect(await counts()).toEqual({
      umbrellas: { free: 10, total: 10 },
      sunbeds: { free: 21, total: 21 },
    });
    await book({ spots: [{ spotId: spot[101], sunbeds: 1 }] });
    expect(await counts()).toEqual({
      umbrellas: { free: 9, total: 10 },
      sunbeds: { free: 18, total: 21 },
    });
  });

  it("adds free standalone sunbed spots, which are not umbrellas", async () => {
    await makeSunbedSpots(204, 205);
    expect(await counts()).toEqual({
      umbrellas: { free: 8, total: 8 },
      sunbeds: { free: 18, total: 18 },
    });
    await book({ spots: [{ spotId: spot[205], sunbeds: 1 }] });
    expect(await counts()).toEqual({
      umbrellas: { free: 8, total: 8 },
      sunbeds: { free: 17, total: 18 },
    });
  });
});

describe("loadDayCounts: no-shows, holds and check-ins (ADR 0015)", () => {
  it("frees a no-show umbrella that nobody rebooked", async () => {
    await book();
    expect(await applyHoldRule(db, rome("11:05"))).toEqual({ bookings: 1, umbrellas: 1 });
    expect(await counts()).toEqual(EMPTY);
  });

  it("counts a rebooked no-show umbrella once", async () => {
    await book();
    await applyHoldRule(db, rome("11:05"));
    await book({ customerName: "Verdi" });
    expect(await counts()).toEqual(taken(1));
  });

  it("keeps a checked-in booking taken past the hold time", async () => {
    const id = await book();
    expect(await checkIn(db, USER, { bookingId: id, date: TODAY }, TODAY)).toEqual({ ok: true });
    expect(await applyHoldRule(db, rome("11:05"))).toEqual({ bookings: 0, umbrellas: 0 });
    expect(await counts()).toEqual(taken(1));
  });

  it("keeps a late hold taken until its own time", async () => {
    const id = await book();
    expect(await setHold(db, USER, { bookingId: id, holdUntil: "13:30" }, TODAY)).toEqual({
      ok: true,
    });
    await applyHoldRule(db, rome("11:05"));
    expect(await counts()).toEqual(taken(1));
  });

  it("keeps a season pass taken past the hold time", async () => {
    await sellPass();
    await applyHoldRule(db, rome("11:05"));
    expect(await counts()).toEqual(taken(1));
  });
});

describe("loadDayCounts: released pass days", () => {
  it("frees a released day and keeps the other days taken", async () => {
    const pass = await sellPass();
    const released = await releaseDays(
      db,
      USER,
      { bookingId: pass, startDate: TOMORROW, endDate: TOMORROW },
      TODAY,
    );
    expect(released).toEqual({ ok: true, days: 1 });
    expect(await counts(TODAY)).toEqual(taken(1));
    expect(await counts(TOMORROW)).toEqual(EMPTY);
    expect(await counts(addDays(TODAY, 2))).toEqual(taken(1));
  });

  it("counts a released day sold to someone else once", async () => {
    const pass = await sellPass();
    await releaseDays(db, USER, { bookingId: pass, startDate: TOMORROW, endDate: TOMORROW }, TODAY);
    await book({
      startDate: TOMORROW,
      endDate: TOMORROW,
      spots: [{ spotId: spot[201], sunbeds: 2 }],
    });
    expect(await counts(TOMORROW)).toEqual(taken(1));
  });
});

describe("loadDayCounts: cancelled and moved bookings use spot_day, not booking_spot", () => {
  it("keeps a cancelled booking's used days taken and frees the rest", async () => {
    const id = await book(
      { startDate: YESTERDAY, endDate: TOMORROW, spots: [{ spotId: spot[103], sunbeds: 1 }] },
      YESTERDAY,
    );
    expect(await cancelBooking(db, USER, { bookingId: id }, TODAY)).toEqual({ ok: true });
    expect(await counts(YESTERDAY)).toEqual(taken(1));
    expect(await counts(TODAY)).toEqual(EMPTY);
    expect(await counts(TOMORROW)).toEqual(EMPTY);
  });

  it("frees a moved booking's old umbrella from the move on, and only counts the new one", async () => {
    const id = await book(
      { startDate: YESTERDAY, endDate: TOMORROW, spots: [{ spotId: spot[103], sunbeds: 1 }] },
      YESTERDAY,
    );
    const moved = await moveBooking(
      db,
      USER,
      { bookingId: id, spots: [{ fromSpotId: spot[103], toSpotId: spot[105] }], fromDate: TODAY },
      TODAY,
    );
    expect(moved).toEqual({ ok: true });
    expect(await counts(YESTERDAY)).toEqual(taken(1));
    expect(await counts(TODAY)).toEqual(taken(1));
    // 103 is free again today: a new booking on it adds one more taken umbrella.
    await book({ spots: [{ spotId: spot[103], sunbeds: 2 }] });
    expect(await counts(TODAY)).toEqual(taken(2));
  });
});
