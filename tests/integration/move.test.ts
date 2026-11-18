import { sql, type Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, getDb } from "@/db/client";
import { createMigrator, runMigrations } from "@/db/migrator";
import type { DB } from "@/db/types";
import { addDays } from "@/i18n/format";
import { addArea } from "@/lib/beach/edit";
import { loadBeach, setupBeach } from "@/lib/beach/layout";
import { listActivity, type Viewer } from "@/lib/booking/audit";
import {
  cancelBooking,
  createBooking,
  loadOccupancy,
  type CreateBookingInput,
} from "@/lib/booking/bookings";
import { moveBooking } from "@/lib/booking/move";
import { createSeasonPass, endSeasonPass, releaseDays } from "@/lib/booking/passes";
import { createSeason, listSeasons } from "@/lib/booking/seasons";
import { undoEntry } from "@/lib/booking/undo";
import { testDatabaseUrl } from "./test-database";

let db: Kysely<DB>;
let migrated = false;
let areaId: number;
/** Spot id by umbrella number. */
let spot: Record<number, number>;
let seasonId: number;
const TODAY = "2027-06-20";
const ANNA: Viewer = { id: "u-anna", role: "staff" };
const BRUNO: Viewer = { id: "u-bruno", role: "staff" };
const ADMIN: Viewer = { id: "u-admin", role: "admin" };

/** A day in July 2027, well after TODAY. */
const jul = (day: number) => `2027-07-${String(day).padStart(2, "0")}`;

const TRUNCATE = sql`truncate venue, area, area_line, spot, season, booking, booking_spot,
  spot_day, audit_log, "user" restart identity cascade`;

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
  // Leave no move entries or non-current umbrellas behind: other files roll 0008 back.
  if (migrated) await TRUNCATE.execute(db);
  await db.destroy();
  await getDb().destroy();
});

function booking(overrides: Partial<CreateBookingInput> = {}): CreateBookingInput {
  return {
    customerName: "Rossi",
    customerPhone: "",
    startDate: jul(10),
    endDate: jul(12),
    spots: [{ spotId: spot[101], sunbeds: 2 }],
    ...overrides,
  };
}

async function book(overrides: Partial<CreateBookingInput> = {}, by = ANNA, today = TODAY) {
  const result = await createBooking(db, by.id, booking(overrides), today);
  if (!result.ok) throw new Error(`booking failed: ${result.error}`);
  return result.bookingId;
}

/** 101 and 102 for the same days, with different sunbeds so a swap is visible. */
function twoUmbrellas(overrides: Partial<CreateBookingInput> = {}) {
  return book({
    spots: [
      { spotId: spot[101], sunbeds: 2 },
      { spotId: spot[102], sunbeds: 1 },
    ],
    ...overrides,
  });
}

/** A booking that started two days ago and ends in two days. */
function startedBooking() {
  return book(
    { startDate: addDays(TODAY, -2), endDate: addDays(TODAY, 2) },
    ANNA,
    addDays(TODAY, -2),
  );
}

async function sellPass(startDate = TODAY) {
  const result = await createSeasonPass(
    db,
    ANNA.id,
    { seasonId, startDate, customerName: "Bianchi", spots: [{ spotId: spot[201], sunbeds: 2 }] },
    TODAY,
  );
  if (!result.ok) throw new Error(`pass failed: ${result.error}`);
  return result.bookingId;
}

const to = (from: number, target: number) => ({ fromSpotId: spot[from], toSpotId: spot[target] });

function move(input: Record<string, unknown>, today = TODAY, by = ANNA) {
  return moveBooking(db, by.id, input, today);
}

async function latestId(): Promise<number> {
  const [entry] = await listActivity(db, 1);
  return entry.id;
}

function undo(entryId: number, by = ANNA, today = TODAY) {
  return undoEntry(db, by, { entryId }, today, new Date());
}

/** The booking's days as [umbrella, date, state], by date then umbrella. */
async function daysOf(bookingId: number): Promise<[number, string, string][]> {
  const { rows } = await sql<{ number: number; date: string; state: string }>`
    select s.number, sd.date, sd.state from spot_day sd
    join booking_spot bs on bs.id = sd.booking_spot_id
    join spot s on s.id = sd.spot_id
    where bs.booking_id = ${bookingId}
    order by sd.date, s.number`.execute(db);
  return rows.map((r) => [r.number, r.date, r.state]);
}

/** Every day from `from` to `to` on one umbrella, in `daysOf` form. */
function range(number: number, from: string, to: string, state = "booked") {
  const out: [number, string, string][] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) out.push([number, date, state]);
  return out;
}

/** The umbrellas that are the booking's own now (booking_spot.current). */
async function currentSpots(bookingId: number) {
  const { rows } = await sql<{ number: number; sunbeds: number }>`
    select s.number, bs.sunbeds from booking_spot bs join spot s on s.id = bs.spot_id
    where bs.booking_id = ${bookingId} and bs.current order by s.number`.execute(db);
  return rows;
}

async function bookingRow(bookingId: number) {
  return db
    .selectFrom("booking")
    .select(["kind", "status", "start_date as startDate", "end_date as endDate"])
    .where("id", "=", bookingId)
    .executeTakeFirstOrThrow();
}

async function spotDayIds(bookingId: number): Promise<Record<string, number>> {
  const { rows } = await sql<{ id: number; number: number; date: string }>`
    select sd.id, s.number, sd.date from spot_day sd
    join booking_spot bs on bs.id = sd.booking_spot_id join spot s on s.id = sd.spot_id
    where bs.booking_id = ${bookingId}`.execute(db);
  return Object.fromEntries(rows.map((r) => [`${r.number}:${r.date}`, r.id]));
}

async function actions(): Promise<string[]> {
  const { rows } = await sql<{ action: string }>`
    select action from audit_log order by id`.execute(db);
  return rows.map((r) => r.action);
}

/** Every booking, booking_spot and spot_day row, to prove a refused move wrote nothing. */
async function snapshot() {
  const dump = async (table: string) =>
    (
      await sql<{ row: unknown }>`select to_jsonb(t) as row from ${sql.table(table)} t
        order by t.id`.execute(db)
    ).rows.map((r) => r.row);
  return {
    booking: await dump("booking"),
    bookingSpot: await dump("booking_spot"),
    spotDay: await dump("spot_day"),
    auditLog: await dump("audit_log"),
  };
}

async function spotDayCount(): Promise<number> {
  const { rows } = await sql<{ n: number }>`select count(*)::int as n from spot_day`.execute(db);
  return rows[0].n;
}

describe("moveBooking: one umbrella to another (AC 1)", () => {
  it("frees 101 and books 105 for 10–12, with one move entry", async () => {
    const id = await book();
    expect(await move({ bookingId: id, spots: [to(101, 105)] })).toEqual({ ok: true });
    expect(await daysOf(id)).toEqual(range(105, jul(10), jul(12)));
    expect(await currentSpots(id)).toEqual([{ number: 105, sunbeds: 2 }]);
    const occupancy = await loadOccupancy(db, areaId, jul(11));
    expect(Object.keys(occupancy).map(Number)).toEqual([spot[105]]);
    expect(await actions()).toEqual(["book", "move"]);
    expect(await book({}, BRUNO)).toBeGreaterThan(id);
  });

  it("logs who moved which booking from and to which umbrellas, without customer data", async () => {
    const id = await book();
    await move({ bookingId: id, spots: [to(101, 105)] }, TODAY, BRUNO);
    const [entry] = await listActivity(db);
    expect(entry).toMatchObject({
      action: "move",
      userId: BRUNO.id,
      bookingId: id,
      undoable: true,
      undone: false,
    });
    expect(entry.detail).toHaveProperty("fromSpots");
    expect(entry.detail).toHaveProperty("toSpots");
    const stored = await db
      .selectFrom("audit_log")
      .select(["detail", "change"])
      .where("action", "=", "move" as never)
      .executeTakeFirstOrThrow();
    expect(JSON.stringify(stored)).not.toContain("Rossi");
  });

  it("writes the days, the umbrella and the entry in one transaction", async () => {
    const id = await book();
    await move({ bookingId: id, spots: [to(101, 105)] });
    const { rows } = await sql<{ x: string }>`
      select xmin::text as x from spot_day where spot_id = ${spot[105]}
      union select xmin::text from booking_spot where booking_id = ${id} and spot_id = ${spot[105]}
      union select xmin::text from audit_log where action = 'move'`.execute(db);
    expect(rows).toHaveLength(1);
  });
});

describe("moveBooking: double booking (AC 2)", () => {
  it("refuses a target booked on any one day and changes nothing", async () => {
    const id = await book();
    await book(
      { startDate: jul(11), endDate: jul(11), spots: [{ spotId: spot[105], sunbeds: 1 }] },
      BRUNO,
    );
    const before = await snapshot();
    expect(await move({ bookingId: id, spots: [to(101, 105)] })).toEqual({
      ok: false,
      error: "taken",
      clashes: [{ spotNumber: 105, date: jul(11) }],
    });
    expect(await snapshot()).toEqual(before);
    expect(await actions()).not.toContain("move");
  });

  it("lists every clash on every target, by date then umbrella", async () => {
    const id = await twoUmbrellas();
    await book(
      { startDate: jul(12), endDate: jul(12), spots: [{ spotId: spot[104], sunbeds: 1 }] },
      BRUNO,
    );
    await book(
      { startDate: jul(10), endDate: jul(10), spots: [{ spotId: spot[105], sunbeds: 1 }] },
      BRUNO,
    );
    const before = await snapshot();
    expect(await move({ bookingId: id, spots: [to(101, 104), to(102, 105)] })).toEqual({
      ok: false,
      error: "taken",
      clashes: [
        { spotNumber: 105, date: jul(10) },
        { spotNumber: 104, date: jul(12) },
      ],
    });
    expect(await snapshot()).toEqual(before);
  });

  it("moves onto a day a season holder released (only booked days clash)", async () => {
    const pass = await sellPass();
    await releaseDays(
      db,
      ANNA.id,
      { bookingId: pass, startDate: jul(10), endDate: jul(12) },
      TODAY,
    );
    const id = await book();
    expect(await move({ bookingId: id, spots: [to(101, 201)] })).toEqual({ ok: true });
    expect(await daysOf(id)).toEqual(range(201, jul(10), jul(12)));
  });
});

describe("moveBooking: concurrent requests (AC 3)", () => {
  async function resetBookings() {
    await sql`truncate booking, booking_spot, spot_day, audit_log restart identity cascade`.execute(
      db,
    );
  }

  it("lets exactly one of two moves onto the same umbrella and days win", async () => {
    for (let round = 0; round < 5; round++) {
      await resetBookings();
      const a = await book();
      const b = await book({ spots: [{ spotId: spot[102], sunbeds: 2 }] });
      const results = await Promise.all([
        move({ bookingId: a, spots: [to(101, 105)] }),
        move({ bookingId: b, spots: [to(102, 105)] }),
      ]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.find((r) => !r.ok)).toMatchObject({ ok: false, error: "taken" });
      const [winner, loser, loserSpot] = results[0].ok ? [a, b, 102] : [b, a, 101];
      expect(await daysOf(winner)).toEqual(range(105, jul(10), jul(12)));
      expect(await daysOf(loser)).toEqual(range(loserSpot, jul(10), jul(12)));
      expect(await spotDayCount()).toBe(6);
      expect((await actions()).filter((x) => x === "move")).toHaveLength(1);
    }
  });

  it("lets exactly one of a move and a new booking for the same umbrella win", async () => {
    for (let round = 0; round < 5; round++) {
      await resetBookings();
      const a = await book();
      const [moved, booked] = await Promise.all([
        move({ bookingId: a, spots: [to(101, 105)] }),
        createBooking(db, BRUNO.id, booking({ spots: [{ spotId: spot[105], sunbeds: 1 }] }), TODAY),
      ]);
      expect([moved.ok, booked.ok].filter(Boolean)).toHaveLength(1);
      expect(moved.ok ? booked : moved).toMatchObject({ ok: false, error: "taken" });
      expect(await daysOf(a)).toEqual(range(moved.ok ? 105 : 101, jul(10), jul(12)));
      expect(await spotDayCount()).toBe(moved.ok ? 3 : 6);
    }
  });

  it("handles crossed moves (101+102 → 104+103 vs 201+202 → 103+104) without a deadlock error", async () => {
    for (let round = 0; round < 5; round++) {
      await resetBookings();
      const a = await twoUmbrellas();
      const b = await book({
        spots: [
          { spotId: spot[201], sunbeds: 1 },
          { spotId: spot[202], sunbeds: 1 },
        ],
      });
      const results = await Promise.all([
        move({ bookingId: a, spots: [to(101, 104), to(102, 103)] }),
        move({ bookingId: b, spots: [to(201, 103), to(202, 104)] }),
      ]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.find((r) => !r.ok)).toMatchObject({ ok: false, error: "taken" });
      expect(await spotDayCount()).toBe(12);
    }
  });
});

describe("moveBooking: range boundaries (AC 4)", () => {
  it.each([
    ["ends on 11", jul(8), jul(11)],
    ["starts on 15", jul(15), jul(16)],
  ])("moves 101 10–12 to 105 12–14 when another booking on 105 %s", async (_name, start, end) => {
    const id = await book();
    await book(
      { startDate: start, endDate: end, spots: [{ spotId: spot[105], sunbeds: 1 }] },
      BRUNO,
    );
    expect(
      await move({ bookingId: id, spots: [to(101, 105)], startDate: jul(12), endDate: jul(14) }),
    ).toEqual({ ok: true });
    expect(await daysOf(id)).toEqual(range(105, jul(12), jul(14)));
    expect(await bookingRow(id)).toMatchObject({ startDate: jul(12), endDate: jul(14) });
  });

  it("refuses 12–14 on 105 when another booking there ends on 12", async () => {
    const id = await book();
    await book(
      { startDate: jul(11), endDate: jul(12), spots: [{ spotId: spot[105], sunbeds: 1 }] },
      BRUNO,
    );
    expect(
      await move({ bookingId: id, spots: [to(101, 105)], startDate: jul(12), endDate: jul(14) }),
    ).toEqual({ ok: false, error: "taken", clashes: [{ spotNumber: 105, date: jul(12) }] });
    expect(await daysOf(id)).toEqual(range(101, jul(10), jul(12)));
  });

  it("moves 10–12 to 11–13 on the same umbrella without clashing with itself", async () => {
    const id = await book();
    const before = await spotDayIds(id);
    expect(
      await move({ bookingId: id, spots: [to(101, 101)], startDate: jul(11), endDate: jul(13) }),
    ).toEqual({ ok: true });
    expect(await daysOf(id)).toEqual(range(101, jul(11), jul(13)));
    const after = await spotDayIds(id);
    // Days kept are untouched: same rows, not deleted and inserted again.
    expect(after[`101:${jul(11)}`]).toBe(before[`101:${jul(11)}`]);
    expect(after[`101:${jul(12)}`]).toBe(before[`101:${jul(12)}`]);
    expect(after).not.toHaveProperty(`101:${jul(10)}`);
    expect(await bookingRow(id)).toMatchObject({
      kind: "multi_day",
      startDate: jul(11),
      endDate: jul(13),
    });
  });

  it("recomputes the kind: multi-day to one day and back", async () => {
    const id = await book();
    await move({ bookingId: id, spots: [to(101, 101)], startDate: jul(14), endDate: jul(14) });
    expect(await bookingRow(id)).toMatchObject({
      kind: "day",
      startDate: jul(14),
      endDate: jul(14),
    });
    await move({ bookingId: id, spots: [to(101, 101)], startDate: jul(14), endDate: jul(15) });
    expect(await bookingRow(id)).toMatchObject({ kind: "multi_day", endDate: jul(15) });
  });

  it("refuses a new range longer than the longest booking", async () => {
    const id = await book();
    expect(
      await move({
        bookingId: id,
        spots: [to(101, 101)],
        startDate: jul(10),
        endDate: addDays(jul(10), 60),
      }),
    ).toEqual({ ok: false, error: "invalid" });
  });
});

describe("moveBooking: swaps, areas, sunbeds, no-ops (AC 5)", () => {
  it("swaps 101 and 102 within the booking: sunbeds go with each umbrella, days untouched", async () => {
    const id = await twoUmbrellas();
    const before = await spotDayIds(id);
    expect(await move({ bookingId: id, spots: [to(101, 102), to(102, 101)] })).toEqual({
      ok: true,
    });
    expect(await currentSpots(id)).toEqual([
      { number: 101, sunbeds: 1 },
      { number: 102, sunbeds: 2 },
    ]);
    expect(await spotDayIds(id)).toEqual(before);
    expect(await actions()).toEqual(["book", "move"]);
  });

  it("refuses an umbrella in another beach space", async () => {
    const id = await book();
    const added = await addArea(db, { areaName: "North", lines: 1, umbrellasPerLine: 2 });
    if (!added.ok) throw new Error("setup failed");
    const north = await loadBeach(db, added.areaId);
    const before = await snapshot();
    const target = north?.lines[0].spots[0].id ?? 0;
    expect(
      await move({ bookingId: id, spots: [{ fromSpotId: spot[101], toSpotId: target }] }),
    ).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(await snapshot()).toEqual(before);
  });

  it("refuses a target that can't hold the umbrella's sunbeds", async () => {
    const id = await book();
    await sql`update spot set included_sunbeds = 1, max_sunbeds = 1 where id = ${spot[105]}`.execute(
      db,
    );
    expect(await move({ bookingId: id, spots: [to(101, 105)] })).toEqual({
      ok: false,
      error: "sunbeds",
    });
    expect(await daysOf(id)).toEqual(range(101, jul(10), jul(12)));
  });

  it.each([
    ["the same umbrellas", {}],
    ["the same umbrellas and dates", { startDate: jul(10), endDate: jul(12) }],
  ])("answers unchanged for %s and logs nothing", async (_name, dates) => {
    const id = await book();
    const before = await snapshot();
    expect(await move({ bookingId: id, spots: [to(101, 101)], ...dates })).toEqual({
      ok: false,
      error: "unchanged",
    });
    expect(await snapshot()).toEqual(before);
  });

  it("refuses a move that leaves out one of the booking's umbrellas", async () => {
    const id = await twoUmbrellas();
    expect(await move({ bookingId: id, spots: [to(101, 105)] })).toEqual({
      ok: false,
      error: "invalid",
    });
  });

  it("refuses moving an umbrella that isn't the booking's", async () => {
    const id = await book();
    expect(await move({ bookingId: id, spots: [to(103, 105)] })).toEqual({
      ok: false,
      error: "invalid",
    });
  });

  it("refuses an unknown target, two umbrellas onto one, and malformed input", async () => {
    const id = await twoUmbrellas();
    expect(
      await move({
        bookingId: id,
        spots: [to(101, 101), { fromSpotId: spot[102], toSpotId: 99999 }],
      }),
    ).toEqual({ ok: false, error: "invalid" });
    expect(await move({ bookingId: id, spots: [to(101, 105), to(102, 105)] })).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(await move({ bookingId: String(id), spots: [to(101, 105)] })).toEqual({
      ok: false,
      error: "invalid",
    });
  });
});

describe("moveBooking: past, started, cancelled, ended (AC 6)", () => {
  it("refuses new dates starting before today", async () => {
    const id = await book();
    expect(
      await move({
        bookingId: id,
        spots: [to(101, 101)],
        startDate: addDays(TODAY, -1),
        endDate: addDays(TODAY, 1),
      }),
    ).toEqual({ ok: false, error: "past" });
  });

  it("refuses a from day before today", async () => {
    const id = await startedBooking();
    expect(
      await move({ bookingId: id, spots: [to(101, 105)], fromDate: addDays(TODAY, -1) }),
    ).toEqual({ ok: false, error: "past" });
  });

  it("refuses a from day after the booking's last day", async () => {
    const id = await startedBooking();
    expect(
      await move({ bookingId: id, spots: [to(101, 105)], fromDate: addDays(TODAY, 3) }),
    ).toEqual({ ok: false, error: "invalid" });
  });

  it("refuses new dates for a booking that has started", async () => {
    const id = await startedBooking();
    const before = await snapshot();
    expect(
      await move({
        bookingId: id,
        spots: [to(101, 101)],
        startDate: TODAY,
        endDate: addDays(TODAY, 3),
      }),
    ).toEqual({ ok: false, error: "started" });
    expect(await snapshot()).toEqual(before);
  });

  it("refuses new dates for a season pass, even one not started yet", async () => {
    const pass = await sellPass(addDays(TODAY, 5));
    expect(
      await move({
        bookingId: pass,
        spots: [to(201, 201)],
        startDate: addDays(TODAY, 6),
        endDate: addDays(TODAY, 8),
      }),
    ).toEqual({ ok: false, error: "started" });
  });

  it("moves a started booking from a day on: earlier days keep their umbrella", async () => {
    const id = await startedBooking();
    const from = addDays(TODAY, 1);
    expect(await move({ bookingId: id, spots: [to(101, 105)], fromDate: from })).toEqual({
      ok: true,
    });
    expect(await daysOf(id)).toEqual([
      ...range(101, addDays(TODAY, -2), TODAY),
      ...range(105, from, addDays(TODAY, 2)),
    ]);
    expect(await bookingRow(id)).toMatchObject({
      startDate: addDays(TODAY, -2),
      endDate: addDays(TODAY, 2),
    });
    expect(await currentSpots(id)).toEqual([{ number: 105, sunbeds: 2 }]);
  });

  it("answers notFound for a cancelled or unknown booking", async () => {
    const id = await book();
    await cancelBooking(db, ANNA.id, { bookingId: id }, TODAY);
    expect(await move({ bookingId: id, spots: [to(101, 105)] })).toEqual({
      ok: false,
      error: "notFound",
    });
    expect(await move({ bookingId: 999, spots: [to(101, 105)] })).toEqual({
      ok: false,
      error: "notFound",
    });
  });

  it("answers ended for a booking whose last day has passed", async () => {
    const earlier = addDays(TODAY, -5);
    const id = await book({ startDate: earlier, endDate: addDays(TODAY, -3) }, ANNA, earlier);
    expect(await move({ bookingId: id, spots: [to(101, 105)], fromDate: TODAY })).toEqual({
      ok: false,
      error: "ended",
    });
  });
});

describe("moveBooking: season passes (AC 7)", () => {
  async function statesBySpot(bookingId: number) {
    const { rows } = await sql<{ number: number; state: string; n: number }>`
      select s.number, sd.state, count(*)::int as n from spot_day sd
      join booking_spot bs on bs.id = sd.booking_spot_id join spot s on s.id = sd.spot_id
      where bs.booking_id = ${bookingId} group by s.number, sd.state
      order by s.number, sd.state`.execute(db);
    return rows;
  }

  it("keeps released days released on the new umbrella without checking them", async () => {
    const pass = await sellPass();
    const released = { startDate: addDays(TODAY, 3), endDate: addDays(TODAY, 4) };
    await releaseDays(db, ANNA.id, { bookingId: pass, ...released }, TODAY);
    // Someone else has 205 on a day the holder gave back: no clash for the pass.
    const other = await book(
      {
        startDate: released.startDate,
        endDate: released.startDate,
        spots: [{ spotId: spot[205], sunbeds: 1 }],
      },
      BRUNO,
    );
    expect(
      await move({ bookingId: pass, spots: [to(201, 205)], fromDate: addDays(TODAY, 1) }),
    ).toEqual({ ok: true });
    expect(await statesBySpot(pass)).toEqual([
      { number: 201, state: "booked", n: 1 },
      { number: 205, state: "booked", n: 85 },
      { number: 205, state: "released", n: 2 },
    ]);
    expect(await daysOf(other)).toEqual(range(205, released.startDate, released.startDate));
    expect(await bookingRow(pass)).toMatchObject({
      kind: "season",
      startDate: TODAY,
      endDate: "2027-09-15",
    });
  });

  it("still refuses a target booked on one of the pass's booked days", async () => {
    const pass = await sellPass();
    const day = addDays(TODAY, 6);
    await book({ startDate: day, endDate: day, spots: [{ spotId: spot[205], sunbeds: 1 }] }, BRUNO);
    expect(
      await move({ bookingId: pass, spots: [to(201, 205)], fromDate: addDays(TODAY, 1) }),
    ).toEqual({ ok: false, error: "taken", clashes: [{ spotNumber: 205, date: day }] });
  });
});

describe("undo a move (AC 8)", () => {
  it("restores umbrellas, dates, kind and sunbeds", async () => {
    const id = await twoUmbrellas();
    await move({
      bookingId: id,
      spots: [to(101, 105), to(102, 102)],
      startDate: jul(14),
      endDate: jul(14),
    });
    expect(await bookingRow(id)).toMatchObject({ kind: "day", startDate: jul(14) });
    expect(await undo(await latestId())).toEqual({ ok: true });
    expect(await bookingRow(id)).toMatchObject({
      kind: "multi_day",
      status: "active",
      startDate: jul(10),
      endDate: jul(12),
    });
    expect(await daysOf(id)).toEqual(
      [...range(101, jul(10), jul(12)), ...range(102, jul(10), jul(12))].sort((a, b) =>
        a[1] === b[1] ? a[0] - b[0] : a[1].localeCompare(b[1]),
      ),
    );
    expect(await currentSpots(id)).toEqual([
      { number: 101, sunbeds: 2 },
      { number: 102, sunbeds: 1 },
    ]);
    const [entry] = await listActivity(db);
    expect(entry).toMatchObject({ action: "undo", undoesAction: "move" });
    expect(
      await book(
        { startDate: jul(14), endDate: jul(14), spots: [{ spotId: spot[105], sunbeds: 1 }] },
        BRUNO,
      ),
    ).toBeGreaterThan(id);
  });

  it("restores the sunbeds of a swap", async () => {
    const id = await twoUmbrellas();
    await move({ bookingId: id, spots: [to(101, 102), to(102, 101)] });
    expect(await undo(await latestId())).toEqual({ ok: true });
    expect(await currentSpots(id)).toEqual([
      { number: 101, sunbeds: 2 },
      { number: 102, sunbeds: 1 },
    ]);
  });

  it("refuses with taken once the old umbrella was booked again", async () => {
    const id = await book();
    await move({ bookingId: id, spots: [to(101, 105)] });
    const entryId = await latestId();
    await book({ startDate: jul(11), endDate: jul(11) }, BRUNO);
    expect(await undo(entryId)).toEqual({
      ok: false,
      error: "taken",
      clashes: [{ spotNumber: 101, date: jul(11) }],
    });
    expect(await daysOf(id)).toEqual(range(105, jul(10), jul(12)));
    expect(await currentSpots(id)).toEqual([{ number: 105, sunbeds: 2 }]);
  });

  it("refuses with changed after a later move, and allows it once that is undone", async () => {
    const id = await book();
    await move({ bookingId: id, spots: [to(101, 105)] });
    const first = await latestId();
    await move({ bookingId: id, spots: [to(105, 104)] });
    expect(await undo(first)).toEqual({ ok: false, error: "changed" });
    expect(await undo(await latestId())).toEqual({ ok: true });
    expect(await undo(first)).toEqual({ ok: true });
    expect(await daysOf(id)).toEqual(range(101, jul(10), jul(12)));
    expect(await currentSpots(id)).toEqual([{ number: 101, sunbeds: 2 }]);
  });

  it("refuses with changed after a cancel", async () => {
    const id = await book();
    await move({ bookingId: id, spots: [to(101, 105)] });
    const entryId = await latestId();
    await cancelBooking(db, ANNA.id, { bookingId: id }, TODAY);
    expect(await undo(entryId)).toEqual({ ok: false, error: "changed" });
  });

  it("refuses to undo a date move once the old range has started", async () => {
    const id = await book();
    await move({ bookingId: id, spots: [to(101, 101)], startDate: jul(15), endDate: jul(17) });
    expect(await undo(await latestId(), ANNA, jul(11))).toEqual({ ok: false, error: "started" });
    expect(await bookingRow(id)).toMatchObject({ startDate: jul(15), endDate: jul(17) });
  });

  it("refuses to undo a date move once the new range has started", async () => {
    const id = await book({ startDate: jul(20), endDate: jul(22) });
    await move({ bookingId: id, spots: [to(101, 101)], startDate: jul(10), endDate: jul(12) });
    expect(await undo(await latestId(), ANNA, jul(11))).toEqual({ ok: false, error: "started" });
  });

  it("undoes a spot-only move from today on: past days stay where they were", async () => {
    const id = await startedBooking();
    await move({ bookingId: id, spots: [to(101, 105)], fromDate: TODAY });
    const tomorrow = addDays(TODAY, 1);
    expect(await undo(await latestId(), ANNA, tomorrow)).toEqual({ ok: true });
    expect(await daysOf(id)).toEqual([
      ...range(101, addDays(TODAY, -2), addDays(TODAY, -1)),
      ...range(105, TODAY, TODAY),
      ...range(101, tomorrow, addDays(TODAY, 2)),
    ]);
    expect(await currentSpots(id)).toEqual([{ number: 101, sunbeds: 2 }]);
  });

  it("re-applies the move when the undo is undone", async () => {
    const id = await book();
    await move({ bookingId: id, spots: [to(101, 105)], startDate: jul(11), endDate: jul(13) });
    await undo(await latestId());
    expect(await undo(await latestId())).toEqual({ ok: true });
    expect(await daysOf(id)).toEqual(range(105, jul(11), jul(13)));
    expect(await bookingRow(id)).toMatchObject({
      kind: "multi_day",
      startDate: jul(11),
      endDate: jul(13),
    });
    expect(await currentSpots(id)).toEqual([{ number: 105, sunbeds: 2 }]);
  });
});

describe("only current umbrellas are shown after a move (AC 9)", () => {
  it("shows the moved group on the map panel", async () => {
    const id = await twoUmbrellas();
    await move({ bookingId: id, spots: [to(101, 105), to(102, 102)] });
    const occupancy = await loadOccupancy(db, areaId, jul(10));
    expect(occupancy[spot[105]]).toMatchObject({
      bookingId: id,
      spots: [
        { number: 102, sunbeds: 1 },
        { number: 105, sunbeds: 2 },
      ],
    });
    expect(occupancy[spot[101]]).toBeUndefined();
  });

  it("shows the current umbrellas on a past day still held by the old one", async () => {
    const id = await startedBooking();
    await move({ bookingId: id, spots: [to(101, 105)], fromDate: TODAY });
    const yesterday = await loadOccupancy(db, areaId, addDays(TODAY, -1));
    expect(yesterday[spot[101]]).toMatchObject({
      bookingId: id,
      spots: [{ number: 105, sunbeds: 2 }],
    });
  });

  it("lists only current umbrellas in the activity, after a move and after a cancel", async () => {
    const id = await twoUmbrellas();
    await move({ bookingId: id, spots: [to(101, 105), to(102, 102)] });
    expect((await listActivity(db)).map((e) => [e.action, e.spots])).toEqual([
      ["move", [102, 105]],
      ["book", [102, 105]],
    ]);
    await cancelBooking(db, ANNA.id, { bookingId: id }, TODAY);
    const [cancel] = await listActivity(db);
    expect(cancel).toMatchObject({ action: "cancel", spots: [102, 105] });
  });

  it("reuses the row of an umbrella the booking had before", async () => {
    const id = await book();
    await move({ bookingId: id, spots: [to(101, 105)] });
    await move({ bookingId: id, spots: [to(105, 101)] });
    expect(await currentSpots(id)).toEqual([{ number: 101, sunbeds: 2 }]);
    const { rows } = await sql<{ n: number }>`
      select count(*)::int as n from booking_spot where booking_id = ${id}`.execute(db);
    expect(rows[0].n).toBe(2);
    expect(await daysOf(id)).toEqual(range(101, jul(10), jul(12)));
  });
});

describe("migration 0008_booking_move", () => {
  const BEFORE = "0007_audit_log";

  async function hasCurrentColumn(): Promise<boolean> {
    const { rows } = await sql<{ n: number }>`
      select count(*)::int as n from information_schema.columns
      where table_name = 'booking_spot' and column_name = 'current'
        and is_nullable = 'NO' and data_type = 'boolean' and column_default = 'true'`.execute(db);
    return rows[0].n === 1;
  }

  const insertMove = () =>
    sql`insert into audit_log (user_id, action) values (${ANNA.id}, 'move')`.execute(db);

  it("adds booking_spot.current (default true) and the move action", async () => {
    await book();
    expect(await hasCurrentColumn()).toBe(true);
    const { rows } = await sql<{ current: boolean }>`select current from booking_spot`.execute(db);
    expect(rows).toEqual([{ current: true }]);
    await expect(insertMove()).resolves.toBeDefined();
  });

  it("rolls back when nothing was moved, then migrates up again", async () => {
    const id = await book();
    try {
      const down = await createMigrator(db).migrateTo(BEFORE);
      expect(down.error).toBeUndefined();
      // Newest first, ending with the one under test; later migrations may come before it.
      const results = down.results ?? [];
      expect(results.at(-1)?.migrationName).toBe("0008_booking_move");
      expect(results.every((r) => r.direction === "Down" && r.status === "Success")).toBe(true);
      expect(await hasCurrentColumn()).toBe(false);
      await expect(insertMove()).rejects.toMatchObject({ code: "23514" });
      expect(await daysOf(id)).toEqual(range(101, jul(10), jul(12)));
    } finally {
      const up = await runMigrations(db, "up");
      if (up.error) throw up.error;
    }
    expect(await hasCurrentColumn()).toBe(true);
    const { rows } = await sql<{ current: boolean }>`select current from booking_spot`.execute(db);
    expect(rows).toEqual([{ current: true }]);
  });

  it("refuses to roll back once a move entry exists", async () => {
    await insertMove();
    try {
      const down = await createMigrator(db).migrateTo(BEFORE);
      expect(down.error).toBeDefined();
      expect(await hasCurrentColumn()).toBe(true);
    } finally {
      const up = await runMigrations(db, "up");
      if (up.error) throw up.error;
    }
  });

  it("refuses to roll back once a booking has a non-current umbrella", async () => {
    await book();
    await sql`update booking_spot set current = false`.execute(db);
    try {
      const down = await createMigrator(db).migrateTo(BEFORE);
      expect(down.error).toBeDefined();
      expect(await hasCurrentColumn()).toBe(true);
    } finally {
      const up = await runMigrations(db, "up");
      if (up.error) throw up.error;
    }
  });
});

describe("moves after earlier moves, and older entries undone after a move", () => {
  it("refuses with changed to undo a pass's last day once the pass has moved", async () => {
    const pass = await sellPass();
    const lastDay = addDays(TODAY, 10);
    expect(await endSeasonPass(db, ANNA.id, { bookingId: pass, lastDay }, TODAY)).toEqual({
      ok: true,
    });
    const lastDayEntry = await latestId();
    expect(await move({ bookingId: pass, spots: [to(201, 205)] })).toEqual({ ok: true });
    const before = await snapshot();
    expect(await undo(lastDayEntry, ADMIN)).toEqual({ ok: false, error: "changed" });
    expect(await snapshot()).toEqual(before);
  });

  it("moves days an earlier move left on the former umbrella", async () => {
    const pass = await sellPass();
    const later = addDays(TODAY, 3);
    expect(await move({ bookingId: pass, spots: [to(201, 205)], fromDate: later })).toEqual({
      ok: true,
    });
    expect(await move({ bookingId: pass, spots: [to(205, 204)] })).toEqual({ ok: true });
    expect((await daysOf(pass)).filter(([number]) => number !== 204)).toEqual([]);
    expect(await currentSpots(pass)).toEqual([{ number: 204, sunbeds: 2 }]);
  });

  it("refuses with split when several umbrellas left days behind", async () => {
    const id = await book(
      {
        startDate: addDays(TODAY, -2),
        endDate: addDays(TODAY, 5),
        spots: [
          { spotId: spot[101], sunbeds: 2 },
          { spotId: spot[102], sunbeds: 1 },
        ],
      },
      ANNA,
      addDays(TODAY, -2),
    );
    const spots = [to(101, 103), to(102, 104)];
    expect(await move({ bookingId: id, spots, fromDate: addDays(TODAY, 2) })).toEqual({ ok: true });
    const before = await snapshot();
    expect(await move({ bookingId: id, spots: [to(103, 105), to(104, 201)] })).toEqual({
      ok: false,
      error: "split",
    });
    expect(await snapshot()).toEqual(before);
  });

  it("refuses a from day inside a day booking that hasn't started", async () => {
    const id = await book();
    expect(await move({ bookingId: id, spots: [to(101, 105)], fromDate: jul(11) })).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(await move({ bookingId: id, spots: [to(101, 105)], fromDate: jul(10) })).toEqual({
      ok: true,
    });
    expect(await daysOf(id)).toEqual(range(105, jul(10), jul(12)));
  });
});

describe("undo after a move from a later day", () => {
  it("undoes a second move that took over days the first one left behind", async () => {
    const pass = await sellPass();
    const first = { bookingId: pass, spots: [to(201, 205)], fromDate: addDays(TODAY, 3) };
    expect(await move(first)).toEqual({ ok: true });
    const before = await daysOf(pass);
    expect(await move({ bookingId: pass, spots: [to(205, 204)] })).toEqual({ ok: true });
    expect(await undo(await latestId())).toEqual({ ok: true });
    expect(await daysOf(pass)).toEqual(before);
    expect(await currentSpots(pass)).toEqual([{ number: 205, sunbeds: 2 }]);
  });

  it("undoes a cancel of a pass moved from a later day", async () => {
    const pass = await sellPass();
    const first = { bookingId: pass, spots: [to(201, 205)], fromDate: addDays(TODAY, 3) };
    expect(await move(first)).toEqual({ ok: true });
    const before = await daysOf(pass);
    expect(await cancelBooking(db, ANNA.id, { bookingId: pass }, TODAY)).toEqual({ ok: true });
    expect(await undo(await latestId())).toEqual({ ok: true });
    expect(await daysOf(pass)).toEqual(before);
  });
});
