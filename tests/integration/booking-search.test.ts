import { sql, type Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, getDb } from "@/db/client";
import { runMigrations } from "@/db/migrator";
import type { DB } from "@/db/types";
import { addDays } from "@/i18n/format";
import { addArea } from "@/lib/beach/edit";
import { loadBeach, setupBeach } from "@/lib/beach/layout";
import { cancelBooking, createBooking, type CreateBookingInput } from "@/lib/booking/bookings";
import { checkIn } from "@/lib/booking/check-in";
import { applyHoldRule } from "@/lib/booking/hold";
import { moveBooking } from "@/lib/booking/move";
import { createSeasonPass, releaseDays } from "@/lib/booking/passes";
import { searchBookings } from "@/lib/booking/search";
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

/** A day in July 2027, well after TODAY. */
const jul = (day: number) => `2027-07-${String(day).padStart(2, "0")}`;

const TRUNCATE = sql`truncate venue, area, area_line, spot, season, booking, booking_spot,
  spot_day, check_in, audit_log, "user" restart identity cascade`;

/** A wall-clock time in Rome on a summer day, as a UTC instant (written out, not computed). */
const rome = (time: string, date = TODAY) => new Date(`${date}T${time}+02:00`);

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
    customerName: "Mario Rossi",
    customerPhone: "+39 333 1234567",
    startDate: jul(5),
    endDate: jul(7),
    spots: [{ spotId: spot[101], sunbeds: 2 }],
    ...overrides,
  };
  const result = await createBooking(db, USER, input, today);
  if (!result.ok) throw new Error(`booking failed: ${result.error}`);
  return result.bookingId;
}

async function sellPass(endDate?: string) {
  const result = await createSeasonPass(
    db,
    USER,
    {
      seasonId,
      startDate: TODAY,
      endDate,
      customerName: "Bianchi",
      spots: [{ spotId: spot[201], sunbeds: 2 }],
    },
    TODAY,
  );
  if (!result.ok) throw new Error(`pass failed: ${result.error}`);
  return result.bookingId;
}

async function release(bookingId: number, startDate: string, endDate = startDate) {
  const result = await releaseDays(db, USER, { bookingId, startDate, endDate }, TODAY);
  if (!result.ok) throw new Error(`release failed: ${result.error}`);
}

const search = (query: string, viewedDate = TODAY) => searchBookings(db, query, TODAY, viewedDate);

async function names(query: string): Promise<string[]> {
  return (await search(query)).map((r) => r.customerName);
}

async function only(query: string, viewedDate = TODAY) {
  const results = await search(query, viewedDate);
  expect(results).toHaveLength(1);
  return results[0];
}

describe("searchBookings: result", () => {
  it("shows the booking, its space, current umbrellas, jump date and today's state", async () => {
    const id = await book({
      spots: [
        { spotId: spot[102], sunbeds: 1 },
        { spotId: spot[101], sunbeds: 2 },
      ],
    });
    expect(await search("rossi")).toEqual([
      {
        bookingId: id,
        customerName: "Mario Rossi",
        customerPhone: "+39 333 1234567",
        kind: "multi_day",
        startDate: jul(5),
        endDate: jul(7),
        areaId,
        areaName: "Main",
        umbrellas: [101, 102],
        jumpDate: jul(5),
        noDaysLeft: false,
        todayState: null,
      },
    ]);
  });

  it("lists a moved booking's current umbrellas only", async () => {
    await book({
      spots: [
        { spotId: spot[101], sunbeds: 2 },
        { spotId: spot[102], sunbeds: 1 },
      ],
    });
    const id = (await only("rossi")).bookingId;
    const moved = await moveBooking(
      db,
      USER,
      {
        bookingId: id,
        spots: [
          { fromSpotId: spot[101], toSpotId: spot[105] },
          { fromSpotId: spot[102], toSpotId: spot[102] },
        ],
      },
      TODAY,
    );
    expect(moved).toEqual({ ok: true });
    expect((await only("rossi")).umbrellas).toEqual([102, 105]);
  });

  it("names the booking's own beach space", async () => {
    const added = await addArea(db, { areaName: "North", lines: 1, umbrellasPerLine: 2 });
    if (!added.ok) throw new Error("setup failed");
    const north = await loadBeach(db, added.areaId);
    await book({ spots: [{ spotId: north?.lines[0].spots[0].id ?? 0, sunbeds: 2 }] });
    const result = await only("rossi");
    expect(result).toMatchObject({ areaId: added.areaId, areaName: "North", umbrellas: [101] });
  });

  it("returns nothing for a query that is too short", async () => {
    await book({ customerName: "R" });
    expect(await search("r")).toEqual([]);
    expect(await search("33")).toEqual([]);
    expect(await search("  ")).toEqual([]);
  });
});

describe("searchBookings: by name", () => {
  beforeEach(async () => {
    await book({ customerName: "Mario Rossi" });
    await book({
      customerName: "Rossana Verdi",
      customerPhone: "333-765-4321",
      startDate: jul(8),
      endDate: jul(8),
    });
    await book({
      customerName: "Luigi Neri",
      customerPhone: "",
      startDate: jul(9),
      endDate: jul(9),
    });
  });

  it("matches a substring, ignoring case", async () => {
    expect(await names("ROSS")).toEqual(["Mario Rossi", "Rossana Verdi"]);
    expect(await names("rossi")).toEqual(["Mario Rossi"]);
    expect(await names("  rio ro ")).toEqual(["Mario Rossi"]);
    expect(await names("bianchi")).toEqual([]);
  });

  it("returns a booking without a phone with a null phone", async () => {
    expect(await only("neri")).toMatchObject({ customerName: "Luigi Neri", customerPhone: null });
  });
});

describe("searchBookings: wildcards match literally", () => {
  beforeEach(async () => {
    const day = (n: number) => ({ startDate: jul(n), endDate: jul(n), customerPhone: "" });
    await book({ customerName: "Bar_Mare", ...day(1) });
    await book({ customerName: "BarXMare", ...day(2) });
    await book({ customerName: "Tom%Lin", ...day(3) });
    await book({ customerName: "Tomaslin", ...day(4) });
    await book({ customerName: "Ab\\Cd", ...day(5) });
    await book({ customerName: "AbCd", ...day(6) });
  });

  it("treats _ as an underscore", async () => {
    expect(await names("r_m")).toEqual(["Bar_Mare"]);
  });

  it("treats % as a percent sign", async () => {
    expect(await names("m%l")).toEqual(["Tom%Lin"]);
  });

  it("treats \\ as a backslash", async () => {
    expect(await names("b\\c")).toEqual(["Ab\\Cd"]);
  });
});

describe("searchBookings: by phone digits", () => {
  beforeEach(async () => {
    await book({ customerName: "Mario Rossi", customerPhone: "+39 333 1234567" });
    await book({
      customerName: "Rossana Verdi",
      customerPhone: "333-765-4321",
      startDate: jul(8),
      endDate: jul(8),
    });
    await book({
      customerName: "Luigi Neri",
      customerPhone: "",
      startDate: jul(9),
      endDate: jul(9),
    });
  });

  it("matches digits whatever the spaces, + and - in query or stored phone", async () => {
    expect(await names("333 12")).toEqual(["Mario Rossi"]);
    expect(await names("+39 333")).toEqual(["Mario Rossi"]);
    expect(await names("3331234567")).toEqual(["Mario Rossi"]);
    expect(await names("765 43")).toEqual(["Rossana Verdi"]);
    expect(await names("333")).toEqual(["Mario Rossi", "Rossana Verdi"]);
  });

  it("never matches a booking without a phone", async () => {
    expect(await names("000")).toEqual([]);
  });
});

describe("searchBookings: which bookings", () => {
  it("leaves out cancelled bookings", async () => {
    const id = await book();
    expect(await cancelBooking(db, USER, { bookingId: id }, TODAY)).toEqual({ ok: true });
    expect(await search("rossi")).toEqual([]);
  });

  it("leaves out bookings that ended before today, keeps one ending today", async () => {
    await book(
      { customerName: "Ended Rossi", startDate: YESTERDAY, endDate: YESTERDAY },
      YESTERDAY,
    );
    await book(
      {
        customerName: "Last Day Rossi",
        startDate: YESTERDAY,
        endDate: TODAY,
        spots: [{ spotId: spot[102], sunbeds: 2 }],
      },
      YESTERDAY,
    );
    expect(await names("rossi")).toEqual(["Last Day Rossi"]);
  });

  it("returns at most 20, soonest first", async () => {
    // Booked in a shuffled order, so creation order can't pass for date order.
    const offsets = Array.from({ length: 25 }, (_, i) => (i * 7) % 25);
    for (const n of offsets) {
      const date = addDays(TODAY, n + 1);
      await book({
        customerName: `Cap ${String(n).padStart(2, "0")}`,
        startDate: date,
        endDate: date,
      });
    }
    const results = await search("cap");
    expect(results).toHaveLength(20);
    expect(results.map((r) => r.startDate)).toEqual(
      Array.from({ length: 20 }, (_, i) => addDays(TODAY, i + 1)),
    );
  });
});

describe("searchBookings: jump date", () => {
  it("is the viewed date when the booking has a booked day then", async () => {
    await book();
    expect(await only("rossi", jul(6))).toMatchObject({ jumpDate: jul(6), noDaysLeft: false });
  });

  it("is the first booked day from today when the viewed date has none", async () => {
    await book();
    expect(await only("rossi", TODAY)).toMatchObject({ jumpDate: jul(5), noDaysLeft: false });
    expect(await only("rossi", jul(20))).toMatchObject({ jumpDate: jul(5), noDaysLeft: false });
  });

  it("keeps a past viewed date the booking was booked on", async () => {
    await book({ startDate: YESTERDAY, endDate: TOMORROW }, YESTERDAY);
    expect(await only("rossi", YESTERDAY)).toMatchObject({
      jumpDate: YESTERDAY,
      noDaysLeft: false,
    });
    expect(await only("rossi", jul(20))).toMatchObject({ jumpDate: TODAY, noDaysLeft: false });
  });

  it("skips a released pass day to the next booked one", async () => {
    const pass = await sellPass();
    await release(pass, TODAY, TOMORROW);
    expect(await only("bianchi", TOMORROW)).toMatchObject({
      jumpDate: addDays(TODAY, 2),
      noDaysLeft: false,
    });
  });

  it("is today for a no-show today, so staff can restore the latecomer", async () => {
    await book({ startDate: TODAY, endDate: TODAY });
    expect(await applyHoldRule(db, rome("11:05"))).toEqual({ bookings: 1, umbrellas: 1 });
    expect(await only("rossi", TOMORROW)).toMatchObject({ jumpDate: TODAY, noDaysLeft: false });
  });

  it("skips a no-show day whose umbrella was rebooked", async () => {
    await book({ startDate: TODAY, endDate: TOMORROW });
    expect(await applyHoldRule(db, rome("11:05"))).toEqual({ bookings: 1, umbrellas: 1 });
    await book({ customerName: "Verdi", startDate: TODAY, endDate: TODAY });
    expect(await only("rossi", TODAY)).toMatchObject({ jumpDate: TOMORROW, noDaysLeft: false });
  });

  it("is today with noDaysLeft when no booked day is left", async () => {
    const pass = await sellPass(addDays(TODAY, 2));
    await release(pass, TODAY, addDays(TODAY, 2));
    expect(await only("bianchi", TOMORROW)).toMatchObject({ jumpDate: TODAY, noDaysLeft: true });
  });
});

describe("searchBookings: today's state", () => {
  it("is null for a booking with no day today", async () => {
    await book();
    expect((await only("rossi")).todayState).toBeNull();
  });

  it("is booked, then checkedIn", async () => {
    const id = await book({ startDate: TODAY, endDate: TODAY });
    expect((await only("rossi")).todayState).toBe("booked");
    expect(await checkIn(db, USER, { bookingId: id, date: TODAY }, TODAY)).toEqual({ ok: true });
    expect((await only("rossi")).todayState).toBe("checkedIn");
  });

  it("is noShow after the hold time", async () => {
    await book({ startDate: TODAY, endDate: TOMORROW });
    expect(await applyHoldRule(db, rome("11:05"))).toEqual({ bookings: 1, umbrellas: 1 });
    expect((await only("rossi")).todayState).toBe("noShow");
  });

  it("is released for a pass that gave today back", async () => {
    const pass = await sellPass();
    await release(pass, TODAY);
    expect((await only("bianchi")).todayState).toBe("released");
  });

  it("does not depend on the viewed date", async () => {
    await book({ startDate: TODAY, endDate: TOMORROW });
    expect((await only("rossi", TOMORROW)).todayState).toBe("booked");
  });
});
