import { sql, type Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, getDb } from "@/db/client";
import { createMigrator, runMigrations } from "@/db/migrator";
import type { DB } from "@/db/types";
import { addDays } from "@/i18n/format";
import { setDefaultHold } from "@/lib/beach/edit";
import { loadBeach, setupBeach } from "@/lib/beach/layout";
import { listActivity, type Viewer } from "@/lib/booking/audit";
import {
  cancelBooking,
  createBooking,
  loadNoShows,
  loadOccupancy,
  type CreateBookingInput,
} from "@/lib/booking/bookings";
import { checkIn, restoreNoShow, setHold, uncheck } from "@/lib/booking/check-in";
import { applyHoldRule } from "@/lib/booking/hold";
import { createSeasonPass, releaseDays } from "@/lib/booking/passes";
import { createSeason, listSeasons } from "@/lib/booking/seasons";
import { undoEntry } from "@/lib/booking/undo";
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
const ANNA: Viewer = { id: "u-anna", role: "staff" };
const BRUNO: Viewer = { id: "u-bruno", role: "staff" };
const ADMIN: Viewer = { id: "u-admin", role: "admin" };
const BEFORE = "0008_booking_move";

const TRUNCATE = sql`truncate venue, area, area_line, spot, season, booking, booking_spot,
  spot_day, check_in, audit_log, "user" restart identity cascade`;

/** A wall-clock time in Rome on a summer day, as a UTC instant (written out, not computed). */
const rome = (time: string, date = TODAY) => new Date(`${date}T${time}+02:00`);
const NONE = { bookings: 0, umbrellas: 0 };

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
    .values(
      [
        [ANNA, "Anna"],
        [BRUNO, "Bruno"],
        [ADMIN, "Carla"],
      ].map(([viewer, name]) => {
        const { id } = viewer as Viewer;
        return { id, name: name as string, email: `${id}@x.invalid`, username: id.slice(2) };
      }),
    )
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
  // 0009's down refuses while check-ins, no-shows or their entries exist; db.test.ts rolls back.
  if (migrated) await TRUNCATE.execute(db);
  await db.destroy();
  await getDb().destroy();
});

function booking(overrides: Partial<CreateBookingInput> = {}): CreateBookingInput {
  return {
    customerName: "Rossi",
    customerPhone: "",
    startDate: TODAY,
    endDate: TODAY,
    spots: [{ spotId: spot[101], sunbeds: 2 }],
    ...overrides,
  };
}

async function book(overrides: Partial<CreateBookingInput> = {}, by = ANNA, today = TODAY) {
  const result = await createBooking(db, by.id, booking(overrides), today);
  if (!result.ok) throw new Error(`booking failed: ${result.error}`);
  return result.bookingId;
}

/** 101 and 102 for today. */
function family(overrides: Partial<CreateBookingInput> = {}) {
  return book({
    spots: [
      { spotId: spot[101], sunbeds: 2 },
      { spotId: spot[102], sunbeds: 1 },
    ],
    ...overrides,
  });
}

/** Yesterday to tomorrow on 103, booked yesterday. */
function threeDays() {
  return book(
    { startDate: YESTERDAY, endDate: TOMORROW, spots: [{ spotId: spot[103], sunbeds: 1 }] },
    ANNA,
    YESTERDAY,
  );
}

async function sellPass() {
  const result = await createSeasonPass(
    db,
    ANNA.id,
    {
      seasonId,
      startDate: TODAY,
      customerName: "Bianchi",
      spots: [{ spotId: spot[201], sunbeds: 2 }],
    },
    TODAY,
  );
  if (!result.ok) throw new Error(`pass failed: ${result.error}`);
  return result.bookingId;
}

const hold = (now: Date) => applyHoldRule(db, now);
const today = (bookingId: number) => ({ bookingId, date: TODAY });

/** The booking's days as [umbrella, date, state], by date then umbrella. */
async function daysOf(bookingId: number): Promise<[number, string, string][]> {
  const { rows } = await sql<{ number: number; date: string; state: string }>`
    select s.number, to_char(sd.date, 'YYYY-MM-DD') as date, sd.state from spot_day sd
    join booking_spot bs on bs.id = sd.booking_spot_id
    join spot s on s.id = sd.spot_id
    where bs.booking_id = ${bookingId}
    order by sd.date, s.number`.execute(db);
  return rows.map((r) => [r.number, r.date, r.state]);
}

async function checkIns() {
  const { rows } = await sql<{ bookingId: number; date: string; by: string }>`
    select booking_id as "bookingId", to_char(date, 'YYYY-MM-DD') as date,
      checked_in_by as by
    from check_in order by booking_id, date`.execute(db);
  return rows;
}

async function actions(): Promise<string[]> {
  const { rows } = await sql<{ action: string }>`
    select action from audit_log order by id`.execute(db);
  return rows.map((r) => r.action);
}

async function latestId(): Promise<number> {
  const [entry] = await listActivity(db, 1);
  return entry.id;
}

function undo(entryId: number, by = ANNA) {
  return undoEntry(db, by, { entryId }, TODAY, new Date());
}

async function holdUntilOf(bookingId: number) {
  const row = await db
    .selectFrom("booking")
    .select("hold_until")
    .where("id", "=", bookingId)
    .executeTakeFirstOrThrow();
  return row.hold_until;
}

/** Every row a refused call could have written. */
async function snapshot() {
  const dump = async (table: string) =>
    (
      await sql<{ row: unknown }>`select to_jsonb(t) as row from ${sql.table(table)} t
        order by to_jsonb(t)::text`.execute(db)
    ).rows.map((r) => r.row);
  return {
    booking: await dump("booking"),
    spotDay: await dump("spot_day"),
    checkIn: await dump("check_in"),
    auditLog: await dump("audit_log"),
  };
}

async function resetBookings() {
  await sql`truncate booking, booking_spot, spot_day, check_in, audit_log
    restart identity cascade`.execute(db);
}

describe("applyHoldRule: the 11:00 boundary (AC 1)", () => {
  it("changes nothing at 10:59:59 Rome", async () => {
    const id = await family();
    expect(await hold(rome("10:59:59"))).toEqual(NONE);
    expect(await daysOf(id)).toEqual([
      [101, TODAY, "booked"],
      [102, TODAY, "booked"],
    ]);
    expect(await actions()).toEqual(["book"]);
  });

  it("flags every umbrella at 11:00:00 with one system entry, then writes nothing again", async () => {
    const a = await family();
    const b = await book({ spots: [{ spotId: spot[105], sunbeds: 1 }] }, BRUNO);
    expect(await hold(rome("11:00:00"))).toEqual({ bookings: 2, umbrellas: 3 });
    expect(await daysOf(a)).toEqual([
      [101, TODAY, "no_show"],
      [102, TODAY, "no_show"],
    ]);
    expect(await daysOf(b)).toEqual([[105, TODAY, "no_show"]]);
    expect(await actions()).toEqual(["book", "book", "no_show"]);
    const stored = await db
      .selectFrom("audit_log")
      .select(["user_id", "booking_id", "change", "detail"])
      .where("action", "=", "no_show")
      .executeTakeFirstOrThrow();
    expect(stored).toEqual({
      user_id: null,
      booking_id: null,
      change: null,
      detail: { date: TODAY, bookings: 2, umbrellas: 3 },
    });

    expect(await hold(rome("11:01:00"))).toEqual(NONE);
    expect(await actions()).toEqual(["book", "book", "no_show"]);
  });

  it("writes one entry when two runs race", async () => {
    await family();
    const results = await Promise.all([hold(rome("11:00:00")), hold(rome("11:00:00"))]);
    expect(results.reduce((n, r) => n + r.bookings, 0)).toBe(1);
    expect((await actions()).filter((a) => a === "no_show")).toHaveLength(1);
  });

  it("flags at 11:00 local on both daylight-saving Sundays (AC 3, in SQL)", async () => {
    for (const [day, utc] of [
      ["2027-03-28", "09:00:00Z"],
      ["2027-10-31", "10:00:00Z"],
    ] as const) {
      const id = await book({ startDate: day, endDate: day }, ANNA, day);
      const at = new Date(`${day}T${utc}`);
      expect(await hold(new Date(at.getTime() - 1000))).toEqual(NONE);
      expect(await hold(at)).toEqual({ bookings: 1, umbrellas: 1 });
      expect(await daysOf(id)).toEqual([[101, day, "no_show"]]);
    }
  });

  it("uses the venue's default hold time", async () => {
    const id = await book();
    await sql`update venue set default_hold_until = '10:00'`.execute(db);
    expect(await hold(rome("10:00:00"))).toEqual({ bookings: 1, umbrellas: 1 });
    expect(await daysOf(id)).toEqual([[101, TODAY, "no_show"]]);
  });
});

/** Pretends the booking was made at `at`, so the job's "made before the hold" rule can be tested. */
async function madeAt(bookingId: number, at: Date) {
  await db.updateTable("booking").set({ created_at: at }).where("id", "=", bookingId).execute();
}

describe("an admin changes the default check-in time", () => {
  it("moves the hold for bookings without their own time, from the next run", async () => {
    const usual = await book();
    const late = await book({ spots: [{ spotId: spot[105], sunbeds: 1 }] });
    await setHold(db, ANNA.id, { bookingId: late, holdUntil: "11:30" }, TODAY);
    expect(await setDefaultHold(db, { defaultHoldUntil: "12:00" })).toMatchObject({ ok: true });

    expect(await hold(rome("11:59:59"))).toEqual({ bookings: 1, umbrellas: 1 });
    expect(await daysOf(usual)).toEqual([[101, TODAY, "booked"]]);
    expect(await daysOf(late)).toEqual([[105, TODAY, "no_show"]]);
    expect(await hold(rome("12:00:00"))).toEqual({ bookings: 1, umbrellas: 1 });
    expect(await daysOf(usual)).toEqual([[101, TODAY, "no_show"]]);
  });

  it("makes a hold stored as the old usual time follow the new one", async () => {
    const id = await book();
    await setHold(db, ANNA.id, { bookingId: id, holdUntil: "11:00" }, TODAY);
    await setDefaultHold(db, { defaultHoldUntil: "09:30" });
    expect(await hold(rome("09:30:00"))).toEqual({ bookings: 1, umbrellas: 1 });
  });

  it("leaves no-shows already flagged as they are when the time moves later", async () => {
    const id = await book();
    expect(await hold(rome("11:00:00"))).toEqual({ bookings: 1, umbrellas: 1 });
    await setDefaultHold(db, { defaultHoldUntil: "13:00" });
    expect(await hold(rome("11:05:00"))).toEqual(NONE);
    expect(await daysOf(id)).toEqual([[101, TODAY, "no_show"]]);
  });

  it("moved earlier, never flags a booking made between the new time and now", async () => {
    const early = await book();
    const walkIn = await book({ spots: [{ spotId: spot[105], sunbeds: 1 }] });
    await madeAt(early, rome("09:00:00"));
    await madeAt(walkIn, rome("10:00:00"));
    await setDefaultHold(db, { defaultHoldUntil: "09:30" });
    expect(await hold(rome("10:15:00"))).toEqual({ bookings: 1, umbrellas: 1 });
    expect(await daysOf(early)).toEqual([[101, TODAY, "no_show"]]);
    expect(await hold(rome("18:00:00"))).toEqual(NONE);
    expect(await daysOf(walkIn)).toEqual([[105, TODAY, "booked"]]);
  });

  it("moved later, flags a booking made after the old time but before the new one", async () => {
    const id = await book();
    await madeAt(id, rome("11:30:00"));
    await setDefaultHold(db, { defaultHoldUntil: "12:00" });
    expect(await hold(rome("11:59:59"))).toEqual(NONE);
    expect(await hold(rome("12:00:00"))).toEqual({ bookings: 1, umbrellas: 1 });
  });

  it("never flags a season pass", async () => {
    const pass = await sellPass();
    await setDefaultHold(db, { defaultHoldUntil: "08:00" });
    expect(await hold(rome("12:00:00"))).toEqual(NONE);
    expect((await daysOf(pass)).every(([, , state]) => state !== "no_show")).toBe(true);
  });
});

describe("applyHoldRule: who is never flagged (AC 2)", () => {
  it("waits for the booking's own hold_until 13:30", async () => {
    const id = await book();
    expect(await setHold(db, ANNA.id, { bookingId: id, holdUntil: "13:30" }, TODAY)).toEqual({
      ok: true,
    });
    expect(await hold(rome("12:00:00"))).toEqual(NONE);
    expect(await hold(rome("13:29:59"))).toEqual(NONE);
    expect(await daysOf(id)).toEqual([[101, TODAY, "booked"]]);
    expect(await hold(rome("13:30:00"))).toEqual({ bookings: 1, umbrellas: 1 });
    expect(await daysOf(id)).toEqual([[101, TODAY, "no_show"]]);
  });

  it("skips a checked-in booking", async () => {
    const id = await book();
    expect(await checkIn(db, ANNA.id, today(id), TODAY)).toEqual({ ok: true });
    expect(await hold(rome("11:00:00"))).toEqual(NONE);
    expect(await daysOf(id)).toEqual([[101, TODAY, "booked"]]);
    expect(await actions()).not.toContain("no_show");
  });

  it("skips a season pass, booked or released", async () => {
    const pass = await sellPass();
    const released = await createSeasonPass(
      db,
      ANNA.id,
      {
        seasonId,
        startDate: TODAY,
        customerName: "Verdi",
        spots: [{ spotId: spot[202], sunbeds: 1 }],
      },
      TODAY,
    );
    if (!released.ok) throw new Error("pass failed");
    await releaseDays(
      db,
      ANNA.id,
      { bookingId: released.bookingId, startDate: TODAY, endDate: TODAY },
      TODAY,
    );
    expect(await hold(rome("12:00:00"))).toEqual(NONE);
    const states = await sql<{ state: string }>`
      select distinct sd.state from spot_day sd join booking_spot bs on bs.id = sd.booking_spot_id
      where bs.booking_id in (${pass}, ${released.bookingId}) and sd.date = ${TODAY}
      order by sd.state`.execute(db);
    expect(states.rows.map((r) => r.state)).toEqual(["booked", "released"]);
  });

  it("skips a cancelled booking even if days remain", async () => {
    const id = await book();
    await sql`update booking set status = 'cancelled', cancelled_at = now(),
      cancelled_by = ${ANNA.id} where id = ${id}`.execute(db);
    expect(await hold(rome("12:00:00"))).toEqual(NONE);
    expect(await daysOf(id)).toEqual([[101, TODAY, "booked"]]);
  });

  it.each([
    ["at the hold instant", "11:00:00"],
    ["after it (a walk-in at 12:00)", "12:00:00"],
  ])("skips a booking created %s", async (_name, created) => {
    const id = await book();
    await sql`update booking set created_at = ${rome(created)} where id = ${id}`.execute(db);
    expect(await hold(rome("14:00:00"))).toEqual(NONE);
    expect(await daysOf(id)).toEqual([[101, TODAY, "booked"]]);
  });

  it("flags only today: yesterday and tomorrow stay booked, a booking for tomorrow is untouched", async () => {
    const id = await threeDays();
    const later = await book({ startDate: TOMORROW, endDate: TOMORROW });
    expect(await hold(rome("11:00:00"))).toEqual({ bookings: 1, umbrellas: 1 });
    expect(await daysOf(id)).toEqual([
      [103, YESTERDAY, "booked"],
      [103, TODAY, "no_show"],
      [103, TOMORROW, "booked"],
    ]);
    expect(await daysOf(later)).toEqual([[101, TOMORROW, "booked"]]);
  });
});

describe("checkIn (AC 4)", () => {
  it("writes one row for a booking with several umbrellas and an undoable entry", async () => {
    const id = await family();
    expect(await checkIn(db, BRUNO.id, today(id), TODAY)).toEqual({ ok: true });
    expect(await checkIns()).toEqual([{ bookingId: id, date: TODAY, by: BRUNO.id }]);
    const [entry] = await listActivity(db);
    expect(entry).toMatchObject({
      action: "check_in",
      userId: BRUNO.id,
      bookingId: id,
      undoable: true,
      undone: false,
    });
  });

  it("answers unchanged the second time and logs nothing", async () => {
    const id = await book();
    await checkIn(db, ANNA.id, today(id), TODAY);
    const before = await snapshot();
    expect(await checkIn(db, ANNA.id, today(id), TODAY)).toEqual({
      ok: false,
      error: "unchanged",
    });
    expect(await snapshot()).toEqual(before);
  });

  it.each([
    ["yesterday", YESTERDAY],
    ["tomorrow", TOMORROW],
  ])("refuses %s with notToday", async (_name, date) => {
    const id = await threeDays();
    expect(await checkIn(db, ANNA.id, { bookingId: id, date }, TODAY)).toEqual({
      ok: false,
      error: "notToday",
    });
    expect(await checkIns()).toEqual([]);
  });

  it("answers notFound for a cancelled or unknown booking, or one with no day today", async () => {
    const cancelled = await book();
    await cancelBooking(db, ANNA.id, { bookingId: cancelled }, TODAY);
    const later = await book({ startDate: TOMORROW, endDate: TOMORROW });
    for (const bookingId of [cancelled, later, 9999]) {
      expect(await checkIn(db, ANNA.id, today(bookingId), TODAY)).toEqual({
        ok: false,
        error: "notFound",
      });
    }
    expect(await checkIns()).toEqual([]);
  });

  it("checks in a season pass, and answers released on a day it gave back", async () => {
    const pass = await sellPass();
    expect(await checkIn(db, ANNA.id, today(pass), TODAY)).toEqual({ ok: true });
    await resetBookings();
    const given = await sellPass();
    await releaseDays(db, ANNA.id, { bookingId: given, startDate: TODAY, endDate: TODAY }, TODAY);
    expect(await checkIn(db, ANNA.id, today(given), TODAY)).toEqual({
      ok: false,
      error: "released",
    });
    expect(await checkIns()).toEqual([]);
  });

  it("answers noShow once flagged", async () => {
    const id = await book();
    await hold(rome("11:00:00"));
    expect(await checkIn(db, ANNA.id, today(id), TODAY)).toEqual({ ok: false, error: "noShow" });
    expect(await checkIns()).toEqual([]);
  });

  it.each([
    ["no input", undefined],
    ["a string id", { bookingId: "1", date: TODAY }],
    ["a bad date", { bookingId: 1, date: "2027-02-30" }],
    ["no date", { bookingId: 1 }],
  ])("refuses %s as invalid", async (_name, input) => {
    expect(await checkIn(db, ANNA.id, input, TODAY)).toEqual({ ok: false, error: "invalid" });
  });
});

describe("uncheck", () => {
  it("deletes the check-in with an uncheck entry; the next run after 11:00 flags it", async () => {
    const id = await book();
    await checkIn(db, ANNA.id, today(id), TODAY);
    expect(await uncheck(db, ANNA.id, today(id), TODAY)).toEqual({ ok: true });
    expect(await checkIns()).toEqual([]);
    expect(await actions()).toEqual(["book", "check_in", "uncheck"]);
    expect(await hold(rome("11:30:00"))).toEqual({ bookings: 1, umbrellas: 1 });
  });

  it("answers unchanged when not checked in, notToday, notFound and invalid", async () => {
    const id = await threeDays();
    expect(await uncheck(db, ANNA.id, today(id), TODAY)).toEqual({
      ok: false,
      error: "unchanged",
    });
    expect(await uncheck(db, ANNA.id, { bookingId: id, date: TOMORROW }, TODAY)).toEqual({
      ok: false,
      error: "notToday",
    });
    expect(await uncheck(db, ANNA.id, today(9999), TODAY)).toEqual({
      ok: false,
      error: "notFound",
    });
    expect(await uncheck(db, ANNA.id, { bookingId: -1, date: TODAY }, TODAY)).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(await actions()).toEqual(["book"]);
  });
});

describe("check-in against the job at the boundary (AC 5)", () => {
  it("never leaves a booking both checked in and flagged", async () => {
    for (let round = 0; round < 20; round++) {
      await resetBookings();
      const id = await family();
      const [checked] = await Promise.all([
        checkIn(db, ANNA.id, today(id), TODAY),
        hold(rome("11:00:00")),
      ]);
      const isIn = (await checkIns()).length === 1;
      const states = new Set((await daysOf(id)).map(([, , state]) => state));
      const flagged = states.has("no_show");
      expect(states.size).toBe(1);
      expect(isIn).not.toBe(flagged);
      expect(checked).toEqual(isIn ? { ok: true } : { ok: false, error: "noShow" });
    }
  });

  it("skips a booking locked by a check-in in flight; the committed check-in wins", async () => {
    const id = await book();
    await db.transaction().execute(async (tx) => {
      await tx.selectFrom("booking").select("id").where("id", "=", id).forUpdate().execute();
      await tx
        .insertInto("check_in")
        .values({ booking_id: id, date: TODAY, checked_in_by: ANNA.id })
        .execute();
      expect(await hold(rome("11:00:00"))).toEqual(NONE);
    });
    expect(await hold(rome("11:01:00"))).toEqual(NONE);
    expect(await daysOf(id)).toEqual([[101, TODAY, "booked"]]);
  });

  it("flags a booking skipped while locked on the next run", async () => {
    const id = await book();
    await db.transaction().execute(async (tx) => {
      await tx.selectFrom("booking").select("id").where("id", "=", id).forUpdate().execute();
      expect(await hold(rome("11:00:00"))).toEqual(NONE);
    });
    expect(await hold(rome("11:01:00"))).toEqual({ bookings: 1, umbrellas: 1 });
  });
});

describe("no-show spots and restore (AC 5, 6, 7)", () => {
  it("restores every no-show umbrella to booked and checks in, logged as restore", async () => {
    const id = await family();
    await hold(rome("11:00:00"));
    expect(await restoreNoShow(db, BRUNO.id, today(id), TODAY)).toEqual({ ok: true });
    expect(await daysOf(id)).toEqual([
      [101, TODAY, "booked"],
      [102, TODAY, "booked"],
    ]);
    expect(await checkIns()).toEqual([{ bookingId: id, date: TODAY, by: BRUNO.id }]);
    const [entry] = await listActivity(db);
    expect(entry).toMatchObject({
      action: "restore",
      userId: BRUNO.id,
      bookingId: id,
      undoable: true,
    });
    expect(entry.detail.from).toBe("no_show");
    expect(await hold(rome("11:30:00"))).toEqual(NONE);
  });

  it("lets another booking take a no-show spot; restore then answers taken and changes nothing", async () => {
    const id = await family();
    await hold(rome("11:00:00"));
    const walkIn = await book(
      { customerName: "Neri", spots: [{ spotId: spot[102], sunbeds: 1 }] },
      BRUNO,
    );
    expect(await daysOf(walkIn)).toEqual([[102, TODAY, "booked"]]);
    const before = await snapshot();
    expect(await restoreNoShow(db, ANNA.id, today(id), TODAY)).toEqual({
      ok: false,
      error: "taken",
      clashes: [{ spotNumber: 102, date: TODAY }],
    });
    expect(await snapshot()).toEqual(before);
  });

  it("answers unchanged, notToday, notFound and invalid", async () => {
    const id = await threeDays();
    expect(await restoreNoShow(db, ANNA.id, today(id), TODAY)).toEqual({
      ok: false,
      error: "unchanged",
    });
    await hold(rome("11:00:00"));
    expect(await restoreNoShow(db, ANNA.id, { bookingId: id, date: YESTERDAY }, TODAY)).toEqual({
      ok: false,
      error: "notToday",
    });
    expect(await restoreNoShow(db, ANNA.id, today(9999), TODAY)).toEqual({
      ok: false,
      error: "notFound",
    });
    expect(await restoreNoShow(db, ANNA.id, { bookingId: id }, TODAY)).toEqual({
      ok: false,
      error: "invalid",
    });
  });

  it("lets exactly one of a restore and a new booking on the same spot win", async () => {
    for (let round = 0; round < 10; round++) {
      await resetBookings();
      const id = await book();
      await hold(rome("11:00:00"));
      const [restored, booked] = await Promise.all([
        restoreNoShow(db, ANNA.id, today(id), TODAY),
        createBooking(db, BRUNO.id, booking({ customerName: "Neri" }), TODAY),
      ]);
      expect([restored.ok, booked.ok].filter(Boolean)).toHaveLength(1);
      expect(restored.ok ? booked : restored).toMatchObject({ ok: false, error: "taken" });
      expect(await daysOf(id)).toEqual([[101, TODAY, restored.ok ? "booked" : "no_show"]]);
      expect(await checkIns()).toHaveLength(restored.ok ? 1 : 0);
    }
  });
});

describe("loaders", () => {
  it("shows checkedIn and holdUntil on occupants", async () => {
    const id = await book();
    const other = await book({ spots: [{ spotId: spot[105], sunbeds: 1 }] }, BRUNO);
    await setHold(db, ANNA.id, { bookingId: other, holdUntil: "13:30" }, TODAY);
    await checkIn(db, ANNA.id, today(id), TODAY);
    const occupancy = await loadOccupancy(db, areaId, TODAY);
    expect(occupancy[spot[101]]).toMatchObject({ bookingId: id, checkedIn: true, holdUntil: null });
    expect(occupancy[spot[105]]).toMatchObject({
      bookingId: other,
      checkedIn: false,
      holdUntil: "13:30",
    });
  });

  it("moves a flagged booking from occupancy to no-shows, still named, even once rebooked", async () => {
    const id = await family();
    await hold(rome("11:00:00"));
    expect(await loadOccupancy(db, areaId, TODAY)).toEqual({});
    const walkIn = await book(
      { customerName: "Neri", spots: [{ spotId: spot[101], sunbeds: 1 }] },
      BRUNO,
    );
    const noShows = await loadNoShows(db, areaId, TODAY);
    expect(Object.keys(noShows).map(Number).sort()).toEqual([spot[101], spot[102]].sort());
    expect(noShows[spot[101]]).toMatchObject({
      bookingId: id,
      customerName: "Rossi",
      checkedIn: false,
      holdUntil: null,
    });
    expect(Object.keys(await loadOccupancy(db, areaId, TODAY)).map(Number)).toEqual([spot[101]]);
    expect((await loadOccupancy(db, areaId, TODAY))[spot[101]].bookingId).toBe(walkIn);
  });
});

describe("multi-day bookings (AC 8)", () => {
  it("a check-in on day 1 doesn't cover day 2", async () => {
    const id = await book({ startDate: TODAY, endDate: TOMORROW });
    await checkIn(db, ANNA.id, today(id), TODAY);
    expect(await hold(rome("11:00:00"))).toEqual(NONE);
    expect((await loadOccupancy(db, areaId, TOMORROW))[spot[101]].checkedIn).toBe(false);
    expect(await checkIn(db, ANNA.id, { bookingId: id, date: TOMORROW }, TODAY)).toEqual({
      ok: false,
      error: "notToday",
    });
    expect(await hold(rome("11:00:00", TOMORROW))).toEqual({ bookings: 1, umbrellas: 1 });
    expect(await daysOf(id)).toEqual([
      [101, TODAY, "booked"],
      [101, TOMORROW, "no_show"],
    ]);
  });
});

describe("setHold", () => {
  it("stores the late arrival time with an undoable hold entry, and clears it", async () => {
    const id = await book({ endDate: TOMORROW });
    expect(await setHold(db, ANNA.id, { bookingId: id, holdUntil: "13:30" }, TODAY)).toEqual({
      ok: true,
    });
    expect(await holdUntilOf(id)).toBe("13:30:00");
    const [entry] = await listActivity(db);
    expect(entry).toMatchObject({ action: "hold", bookingId: id, undoable: true });
    expect(await setHold(db, ANNA.id, { bookingId: id, holdUntil: null }, TODAY)).toEqual({
      ok: true,
    });
    expect(await holdUntilOf(id)).toBeNull();
  });

  it("stores the venue's usual time as no hold of its own", async () => {
    const id = await book();
    await setHold(db, ANNA.id, { bookingId: id, holdUntil: "13:30" }, TODAY);
    expect(await setHold(db, ANNA.id, { bookingId: id, holdUntil: "11:00" }, TODAY)).toEqual({
      ok: true,
    });
    expect(await holdUntilOf(id)).toBeNull();
  });

  it("answers unchanged for the same time and logs nothing", async () => {
    const id = await book();
    await setHold(db, ANNA.id, { bookingId: id, holdUntil: "13:30" }, TODAY);
    const before = await snapshot();
    expect(await setHold(db, ANNA.id, { bookingId: id, holdUntil: "13:30" }, TODAY)).toEqual({
      ok: false,
      error: "unchanged",
    });
    expect(await setHold(db, ANNA.id, { bookingId: id + 1, holdUntil: null }, TODAY)).toEqual({
      ok: false,
      error: "notFound",
    });
    expect(await snapshot()).toEqual(before);
  });

  it("refuses a season pass, an ended booking, a cancelled one and bad times", async () => {
    const pass = await sellPass();
    expect(await setHold(db, ANNA.id, { bookingId: pass, holdUntil: "13:30" }, TODAY)).toEqual({
      ok: false,
      error: "season",
    });
    const ended = await book({ startDate: YESTERDAY, endDate: YESTERDAY }, ANNA, YESTERDAY);
    expect(await setHold(db, ANNA.id, { bookingId: ended, holdUntil: "13:30" }, TODAY)).toEqual({
      ok: false,
      error: "ended",
    });
    const cancelled = await book();
    await cancelBooking(db, ANNA.id, { bookingId: cancelled }, TODAY);
    expect(await setHold(db, ANNA.id, { bookingId: cancelled, holdUntil: "13:30" }, TODAY)).toEqual(
      { ok: false, error: "notFound" },
    );
    const id = await book({ startDate: TOMORROW, endDate: TOMORROW });
    for (const holdUntil of ["25:00", "13:60", "1330", "13:3", "", 1330]) {
      expect(await setHold(db, ANNA.id, { bookingId: id, holdUntil }, TODAY)).toEqual({
        ok: false,
        error: "invalid",
      });
    }
    expect(await holdUntilOf(id)).toBeNull();
  });
});

describe("undo (AC 7)", () => {
  it("undoes a check-in, and an uncheck puts it back", async () => {
    const id = await book();
    await checkIn(db, ANNA.id, today(id), TODAY);
    expect(await undo(await latestId())).toEqual({ ok: true });
    expect(await checkIns()).toEqual([]);
    expect((await listActivity(db, 1))[0]).toMatchObject({
      action: "undo",
      undoesAction: "check_in",
    });

    await checkIn(db, ANNA.id, today(id), TODAY);
    await uncheck(db, ANNA.id, today(id), TODAY);
    expect(await undo(await latestId())).toEqual({ ok: true });
    expect(await checkIns()).toEqual([{ bookingId: id, date: TODAY, by: ANNA.id }]);
  });

  it("undoes a restore: the days go back to no_show and the check-in goes", async () => {
    const id = await family();
    await hold(rome("11:00:00"));
    await restoreNoShow(db, ANNA.id, today(id), TODAY);
    expect(await undo(await latestId())).toEqual({ ok: true });
    expect(await daysOf(id)).toEqual([
      [101, TODAY, "no_show"],
      [102, TODAY, "no_show"],
    ]);
    expect(await checkIns()).toEqual([]);
  });

  it("refuses to bring a check-in back once the job flagged the booking", async () => {
    const id = await book();
    await checkIn(db, ANNA.id, today(id), TODAY);
    await uncheck(db, ANNA.id, today(id), TODAY);
    const uncheckId = await latestId();
    await hold(rome("11:01:00"));
    expect(await undo(uncheckId)).toEqual({ ok: false, error: "changed" });
    expect(await checkIns()).toEqual([]);
    expect(await daysOf(id)).toEqual([[101, TODAY, "no_show"]]);
  });

  it("answers ended for yesterday's check-in of a booking still running", async () => {
    const id = await threeDays();
    await checkIn(db, ANNA.id, { bookingId: id, date: YESTERDAY }, YESTERDAY);
    const entryId = await latestId();
    expect(await undoEntry(db, ADMIN, { entryId }, TODAY, new Date())).toEqual({
      ok: false,
      error: "ended",
    });
    expect(await checkIns()).toEqual([{ bookingId: id, date: YESTERDAY, by: ANNA.id }]);
  });

  it("refuses to undo a hold change after a later one", async () => {
    const id = await book();
    await setHold(db, ANNA.id, { bookingId: id, holdUntil: "13:30" }, TODAY);
    const first = await latestId();
    await setHold(db, ANNA.id, { bookingId: id, holdUntil: "15:00" }, TODAY);
    expect(await undo(first)).toEqual({ ok: false, error: "changed" });
    expect(await holdUntilOf(id)).toBe("15:00:00");
  });

  it("undoes a hold change back to the previous time", async () => {
    const id = await book();
    await setHold(db, ANNA.id, { bookingId: id, holdUntil: "13:30" }, TODAY);
    await setHold(db, ANNA.id, { bookingId: id, holdUntil: "15:00" }, TODAY);
    expect(await undo(await latestId())).toEqual({ ok: true });
    expect(await holdUntilOf(id)).toBe("13:30:00");
  });
});

describe("system entries in the activity stream (AC 9)", () => {
  it("lists a no-show run with no user and refuses to undo it", async () => {
    await book();
    await hold(rome("11:00:00"));
    const [entry] = await listActivity(db);
    expect(entry).toMatchObject({
      action: "no_show",
      userId: null,
      userName: null,
      bookingId: null,
      undoable: false,
      detail: { date: TODAY, bookings: 1, umbrellas: 1 },
    });
    const before = await snapshot();
    expect(await undo(entry.id, ADMIN)).toEqual({ ok: false, error: "invalid" });
    expect(await snapshot()).toEqual(before);
  });

  it("refuses a user-less entry for any other action", async () => {
    await expect(
      sql`insert into audit_log (user_id, action) values (null, 'check_in')`.execute(db),
    ).rejects.toMatchObject({ code: "23514" });
  });
});

describe("migration 0009", () => {
  const hasCheckIn = async () =>
    (
      await sql<{ n: number }>`select count(*)::int as n from information_schema.tables
        where table_name = 'check_in'`.execute(db)
    ).rows[0].n === 1;

  async function rollBack() {
    try {
      return await createMigrator(db).migrateTo(BEFORE);
    } finally {
      const up = await runMigrations(db, "up");
      if (up.error) throw up.error;
    }
  }

  it("rolls back when nobody was checked in or flagged, then migrates up again", async () => {
    const id = await book();
    const migrator = createMigrator(db);
    try {
      const down = await migrator.migrateTo(BEFORE);
      expect(down.error).toBeUndefined();
      // Newest first, ending with the one under test; later migrations may come before it.
      const results = down.results ?? [];
      expect(results.at(-1)?.migrationName).toBe("0009_check_in");
      expect(results.every((r) => r.direction === "Down" && r.status === "Success")).toBe(true);
      expect(await hasCheckIn()).toBe(false);
      expect(await daysOf(id)).toEqual([[101, TODAY, "booked"]]);
    } finally {
      const up = await runMigrations(db, "up");
      if (up.error) throw up.error;
    }
    expect(await hasCheckIn()).toBe(true);
    expect(await checkIn(db, ANNA.id, today(id), TODAY)).toEqual({ ok: true });
  });

  it("refuses to roll back once someone was checked in", async () => {
    const id = await book();
    await checkIn(db, ANNA.id, today(id), TODAY);
    expect((await rollBack()).error).toBeDefined();
    expect(await checkIns()).toHaveLength(1);
  });

  it("refuses to roll back once a day was flagged no_show", async () => {
    const id = await book();
    await hold(rome("11:00:00"));
    expect((await rollBack()).error).toBeDefined();
    expect(await daysOf(id)).toEqual([[101, TODAY, "no_show"]]);
  });
});
