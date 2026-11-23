import { sql, type Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, getDb } from "@/db/client";
import { createMigrator, runMigrations } from "@/db/migrator";
import type { DB } from "@/db/types";
import { addDays, venueDayStart } from "@/i18n/format";
import { loadBeach, setupBeach } from "@/lib/beach/layout";
import { listActivity, writeEntry, type Viewer } from "@/lib/booking/audit";
import { cancelBooking, createBooking, type CreateBookingInput } from "@/lib/booking/bookings";
import { createSeasonPass, endSeasonPass, releaseDays, restoreDays } from "@/lib/booking/passes";
import { createSeason, listSeasons } from "@/lib/booking/seasons";
import { undoEntry } from "@/lib/booking/undo";
import { stampEntry, stampToday } from "./audit-clock";
import { testDatabaseUrl } from "./test-database";

let db: Kysely<DB>;
let migrated = false;
let spot: Record<number, number>;
let seasonId: number;
const TODAY = "2027-06-20";
const ANNA: Viewer = { id: "u-anna", role: "staff" };
const BRUNO: Viewer = { id: "u-bruno", role: "staff" };
const ADMIN: Viewer = { id: "u-admin", role: "admin" };

beforeAll(async () => {
  db = createDb(testDatabaseUrl());
  const result = await runMigrations(db, "up");
  if (result.error) throw result.error;
  migrated = true;
});

beforeEach(async () => {
  if (!migrated) throw new Error("migrations did not run; refusing to truncate");
  await sql`truncate venue, area, area_line, spot, season, booking, booking_spot, spot_day,
    audit_log, "user" restart identity cascade`.execute(db);
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
  spot = Object.fromEntries(beach.lines.flatMap((l) => l.spots.map((s) => [s.number, s.id])));
  await createSeason(db, { name: "Estate 2027", startDate: "2027-06-01", endDate: "2027-09-15" });
  seasonId = (await listSeasons(db))[0].id;
});

afterAll(async () => {
  await db.destroy();
  await getDb().destroy();
});

function booking(overrides: Partial<CreateBookingInput> = {}): CreateBookingInput {
  return {
    customerName: "Rossi",
    customerPhone: "",
    startDate: TODAY,
    endDate: addDays(TODAY, 2),
    spots: [
      { spotId: spot[101], sunbeds: 2 },
      { spotId: spot[102], sunbeds: 2 },
    ],
    ...overrides,
  };
}

async function book(by: Viewer = ANNA, overrides: Partial<CreateBookingInput> = {}) {
  const result = await createBooking(db, by.id, booking(overrides), TODAY);
  if (!result.ok) throw new Error(`booking failed: ${result.error}`);
  return result.bookingId;
}

async function sellPass(by: Viewer = ANNA) {
  const result = await createSeasonPass(
    db,
    by.id,
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

async function latestId(): Promise<number> {
  const [entry] = await listActivity(db, new Date(0), 1);
  return entry.id;
}

/** Undo with the entry stamped as made today, so only the rule under test can refuse it. */
async function undo(entryId: number, by: Viewer = ANNA, today = TODAY, now = new Date()) {
  await stampToday(db, entryId, today);
  return undoEntry(db, by, { entryId }, today, now);
}

const DAY_START = venueDayStart(TODAY);
const MINUTE = 60_000;

/** Undo exactly as stored: the entry keeps the time it was stamped with. */
function undoAsStamped(entryId: number, by: Viewer, now: Date) {
  return undoEntry(db, by, { entryId }, TODAY, now);
}

let stampedCount = 0;

async function stampedEntry(by: Viewer, at: Date): Promise<number> {
  const day = addDays(TODAY, 1 + stampedCount++);
  await book(by, { startDate: day, endDate: day });
  const id = await latestId();
  await stampEntry(db, id, at);
  return id;
}

async function bookingState(bookingId: number) {
  const row = await db
    .selectFrom("booking")
    .select(["status", "end_date", "cancelled_by"])
    .where("id", "=", bookingId)
    .executeTakeFirstOrThrow();
  const days = await sql<{ state: string; n: number }>`
    select sd.state, count(*)::int as n from spot_day sd
    join booking_spot bs on bs.id = sd.booking_spot_id
    where bs.booking_id = ${bookingId} group by sd.state order by sd.state`.execute(db);
  return {
    status: row.status,
    endDate: row.end_date,
    cancelledBy: row.cancelled_by,
    days: Object.fromEntries(days.rows.map((r) => [r.state, r.n])),
  };
}

async function bookingCount(): Promise<number> {
  const { count } = await db
    .selectFrom("booking")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("status", "=", "active")
    .executeTakeFirstOrThrow();
  return Number(count);
}

async function entryCount(): Promise<number> {
  const { count } = await db
    .selectFrom("audit_log")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .executeTakeFirstOrThrow();
  return Number(count);
}

describe("logging", () => {
  it("logs a booking with who, which booking, its umbrellas and the customer from the booking", async () => {
    const id = await book();
    const [entry] = await listActivity(db, new Date(0), 500);
    expect(entry).toMatchObject({
      userId: ANNA.id,
      userName: "Anna",
      action: "book",
      bookingId: id,
      kind: "multi_day",
      customerName: "Rossi",
      spots: [101, 102],
      startDate: TODAY,
      endDate: addDays(TODAY, 2),
      undoable: true,
      undone: false,
    });
    const stored = await db.selectFrom("audit_log").select(["change"]).executeTakeFirstOrThrow();
    expect(JSON.stringify(stored.change)).not.toContain("Rossi");
  });

  it("mentions the deckchairs on the book entry only when there are some", async () => {
    await book(ANNA, { deckchairs: 4 });
    await book(ANNA, { startDate: addDays(TODAY, 5), endDate: addDays(TODAY, 5) });
    const [without, withFour] = await listActivity(db, new Date(0), 500);
    expect(withFour).toMatchObject({ action: "book", detail: { deckchairs: 4 } });
    expect(without).toMatchObject({ action: "book", detail: {} });
  });

  it("writes nothing when the change fails", async () => {
    await book();
    expect(await entryCount()).toBe(1);
    const taken = await createBooking(db, BRUNO.id, booking(), TODAY);
    expect(taken).toMatchObject({ ok: false, error: "taken" });
    expect(await cancelBooking(db, ANNA.id, { bookingId: 999 }, TODAY)).toMatchObject({
      ok: false,
    });
    expect(await entryCount()).toBe(1);
  });

  it("logs a release only when days moved", async () => {
    const pass = await sellPass();
    const range = { bookingId: pass, startDate: TODAY, endDate: addDays(TODAY, 1) };
    await releaseDays(db, ANNA.id, range, TODAY);
    await releaseDays(db, ANNA.id, range, TODAY);
    const actions = (await listActivity(db, new Date(0), 500)).map((e) => [e.action, e.detail]);
    expect(actions).toEqual([
      ["release", { startDate: TODAY, endDate: addDays(TODAY, 1), days: 2 }],
      ["book", {}],
    ]);
  });

  it("lists every entry from today on, newest first, not just 10", async () => {
    for (let i = 0; i < 15; i++) {
      await book(ANNA, { startDate: addDays(TODAY, i * 3), endDate: addDays(TODAY, i * 3) });
    }
    await sql`update audit_log set created_at = ${DAY_START.toISOString()}::timestamptz
      + id * interval '1 minute'`.execute(db);
    const entries = await listActivity(db, DAY_START, 500);
    expect(entries).toHaveLength(15);
    expect(entries[0].startDate).toBe(addDays(TODAY, 42));
    expect(entries[14].startDate).toBe(TODAY);
  });

  it("starts at today 00:00 Rome: 23:59 the day before is out, midnight is in", async () => {
    const before = await stampedEntry(ANNA, new Date(DAY_START.getTime() - MINUTE));
    const at = await stampedEntry(ANNA, DAY_START);
    const ids = (await listActivity(db, DAY_START, 500)).map((e) => e.id);
    expect(ids).toEqual([at]);
    expect(ids).not.toContain(before);
  });

  it("starts the day at the right instant on a 23-hour and a 25-hour day", async () => {
    for (const day of ["2027-03-28", "2027-10-31"]) {
      const start = venueDayStart(day);
      await sql`truncate audit_log restart identity cascade`.execute(db);
      const out = await stampedEntry(ANNA, new Date(start.getTime() - MINUTE));
      const inn = await stampedEntry(ANNA, start);
      const ids = (await listActivity(db, start, 500)).map((e) => e.id);
      expect([day, ids]).toEqual([day, [inn]]);
      expect(ids).not.toContain(out);
    }
  });

  it("returns at most the cap, newest first", async () => {
    for (let i = 0; i < 5; i++) {
      await book(ANNA, { startDate: addDays(TODAY, i * 3), endDate: addDays(TODAY, i * 3) });
    }
    const entries = await listActivity(db, new Date(0), 3);
    expect(entries.map((e) => e.startDate)).toEqual([
      addDays(TODAY, 12),
      addDays(TODAY, 9),
      addDays(TODAY, 6),
    ]);
  });
});

describe("undo", () => {
  it("undoes a booking: the umbrellas are free and the entry is marked undone", async () => {
    const id = await book();
    const entryId = await latestId();
    expect(await undo(entryId)).toEqual({ ok: true });
    expect(await bookingState(id)).toEqual({
      status: "cancelled",
      endDate: addDays(TODAY, 2),
      cancelledBy: ANNA.id,
      days: {},
    });
    const [undoEntryRow, original] = await listActivity(db, new Date(0), 500);
    expect(undoEntryRow).toMatchObject({ action: "undo", undoesAction: "book", undone: false });
    expect(original).toMatchObject({ id: entryId, undone: true });
    expect(await book(BRUNO)).toBeGreaterThan(id);
  });

  it("undoes a cancel by booking the same umbrellas and days again", async () => {
    const id = await book();
    await cancelBooking(db, ANNA.id, { bookingId: id }, TODAY);
    expect(await undo(await latestId())).toEqual({ ok: true });
    expect(await bookingState(id)).toEqual({
      status: "active",
      endDate: addDays(TODAY, 2),
      cancelledBy: null,
      days: { booked: 6 },
    });
  });

  it("can undo an undo, and that again", async () => {
    const id = await book();
    await undo(await latestId());
    expect(await undo(await latestId())).toEqual({ ok: true });
    expect((await bookingState(id)).days).toEqual({ booked: 6 });
    expect(await undo(await latestId())).toEqual({ ok: true });
    expect((await bookingState(id)).days).toEqual({});
  });

  it("undoes a booking with deckchairs, and undoing that restores it with them", async () => {
    const id = await book(ANNA, { deckchairs: 3 });
    const deckchairs = async () =>
      (
        await db
          .selectFrom("booking")
          .select("deckchairs")
          .where("id", "=", id)
          .executeTakeFirstOrThrow()
      ).deckchairs;
    expect(await deckchairs()).toBe(3);
    expect(await undo(await latestId())).toEqual({ ok: true });
    expect(await bookingState(id)).toMatchObject({ status: "cancelled", days: {} });
    expect(await undo(await latestId())).toEqual({ ok: true });
    expect(await bookingState(id)).toMatchObject({ status: "active", days: { booked: 6 } });
    expect(await deckchairs()).toBe(3);
  });

  it("refuses to undo a cancel once someone else booked one of the umbrellas", async () => {
    const id = await book();
    await cancelBooking(db, ANNA.id, { bookingId: id }, TODAY);
    const cancelEntry = await latestId();
    await book(BRUNO, {
      startDate: addDays(TODAY, 1),
      endDate: addDays(TODAY, 1),
      spots: [{ spotId: spot[102], sunbeds: 1 }],
    });
    expect(await undo(cancelEntry)).toEqual({
      ok: false,
      error: "taken",
      clashes: [{ spotNumber: 102, date: addDays(TODAY, 1) }],
    });
    expect((await bookingState(id)).status).toBe("cancelled");
  });

  it("refuses while a later change to the same booking stands, and allows it once that is undone", async () => {
    const pass = await sellPass();
    const sale = await latestId();
    await releaseDays(db, ANNA.id, { bookingId: pass, startDate: TODAY, endDate: TODAY }, TODAY);
    expect(await undo(sale)).toEqual({ ok: false, error: "changed" });
    expect(await undo(await latestId())).toEqual({ ok: true });
    expect(await undo(sale)).toEqual({ ok: true });
    expect((await bookingState(pass)).status).toBe("cancelled");
  });

  it("undoes a release and a restore", async () => {
    const pass = await sellPass();
    const range = { bookingId: pass, startDate: TODAY, endDate: addDays(TODAY, 2) };
    await releaseDays(db, ANNA.id, range, TODAY);
    expect(await undo(await latestId())).toEqual({ ok: true });
    expect((await bookingState(pass)).days).toEqual({ booked: 88 });
    await releaseDays(db, ANNA.id, range, TODAY);
    await restoreDays(db, ANNA.id, { ...range, endDate: TODAY }, TODAY);
    expect(await undo(await latestId())).toEqual({ ok: true });
    expect((await bookingState(pass)).days).toEqual({ booked: 85, released: 3 });
  });

  it("refuses to undo a release once a released day was sold", async () => {
    const pass = await sellPass();
    await releaseDays(db, ANNA.id, { bookingId: pass, startDate: TODAY, endDate: TODAY }, TODAY);
    const release = await latestId();
    await book(BRUNO, { endDate: TODAY, spots: [{ spotId: spot[201], sunbeds: 1 }] });
    expect(await undo(release)).toMatchObject({ ok: false, error: "taken" });
    expect((await bookingState(pass)).days).toEqual({ booked: 87, released: 1 });
  });

  it("undoes a last day: the pass runs to its old end again", async () => {
    const pass = await sellPass();
    await endSeasonPass(db, ANNA.id, { bookingId: pass, lastDay: "2027-07-31" }, TODAY);
    expect((await bookingState(pass)).days).toEqual({ booked: 42 });
    expect(await undo(await latestId())).toEqual({ ok: true });
    expect(await bookingState(pass)).toMatchObject({
      status: "active",
      endDate: "2027-09-15",
      days: { booked: 88 },
    });
  });

  it("never touches days before today", async () => {
    const id = await book();
    const entryId = await latestId();
    const later = addDays(TODAY, 2);
    expect(await undo(entryId, ADMIN, later)).toEqual({ ok: true });
    expect(await bookingState(id)).toMatchObject({ status: "cancelled", days: { booked: 4 } });
    // The undo's own entry holds only what it changed, so undoing it books just that day again.
    expect(await undo(await latestId(), ADMIN, later)).toEqual({ ok: true });
    expect(await bookingState(id)).toMatchObject({ status: "active", days: { booked: 6 } });
  });

  it("refuses once the booking has ended, even inside the 30 minutes", async () => {
    await book(ANNA, { endDate: TODAY });
    const entryId = await latestId();
    expect(await undo(entryId, ANNA, addDays(TODAY, 1))).toEqual({ ok: false, error: "ended" });
  });

  it("brings released days back as released when a last day is undone", async () => {
    const pass = await sellPass();
    const august = { bookingId: pass, startDate: "2027-08-10", endDate: "2027-08-11" };
    await releaseDays(db, ANNA.id, august, TODAY);
    await endSeasonPass(db, ANNA.id, { bookingId: pass, lastDay: "2027-07-31" }, TODAY);
    expect(await undo(await latestId())).toEqual({ ok: true });
    expect((await bookingState(pass)).days).toEqual({ booked: 86, released: 2 });
  });

  it("shows the original as standing again once its undo is undone", async () => {
    await book();
    const original = await latestId();
    await undo(original);
    await undo(await latestId());
    const entries = await listActivity(db, new Date(0), 500);
    expect(entries.find((e) => e.id === original)).toMatchObject({ undone: false });
    expect(entries[1]).toMatchObject({ action: "undo", undone: true });
  });

  it("undoes an entry only once, even when two people try at the same time", async () => {
    await book();
    const entryId = await latestId();
    const results = await Promise.all([undo(entryId, ANNA), undo(entryId, ADMIN)]);
    expect(results.map((r) => r.ok).sort()).toEqual([false, true]);
    expect(results).toContainEqual({ ok: false, error: "undone" });
    expect(await entryCount()).toBe(2);
  });

  it("refuses beach and season entries", async () => {
    await writeEntry(db, { userId: ADMIN.id, action: "beach", detail: { what: "addLine" } });
    const [entry] = await listActivity(db, new Date(0), 500);
    expect(entry).toMatchObject({ action: "beach", undoable: false, bookingId: null });
    expect(await undo(entry.id, ADMIN)).toEqual({ ok: false, error: "invalid" });
  });

  it("rejects malformed input", async () => {
    expect(await undoEntry(db, ANNA, { entryId: "1" }, TODAY)).toEqual({
      ok: false,
      error: "invalid",
    });
  });
});

describe("who may undo", () => {
  it("lets staff undo only their own entries", async () => {
    await book(ANNA);
    expect(await undo(await latestId(), BRUNO)).toEqual({ ok: false, error: "forbidden" });
  });

  it("lets staff undo their own entries for 30 minutes, not 31", async () => {
    const at = new Date(DAY_START.getTime() + 9 * 60 * MINUTE);
    const late = await stampedEntry(ANNA, at);
    expect(await undoAsStamped(late, ANNA, new Date(at.getTime() + 31 * MINUTE))).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await bookingCount()).toBe(1);
    expect(await undoAsStamped(late, ANNA, new Date(at.getTime() + 30 * MINUTE))).toEqual({
      ok: true,
    });
  });

  it("lets an admin undo anyone's entry at any time", async () => {
    const at = new Date(DAY_START.getTime() + MINUTE);
    const entryId = await stampedEntry(BRUNO, at);
    const late = new Date(DAY_START.getTime() + 23 * 60 * MINUTE);
    expect(await undoAsStamped(entryId, ADMIN, late)).toEqual({ ok: true });
  });

  it("allows an entry from today even when it is the 11th newest or older", async () => {
    const old = await stampedEntry(ANNA, new Date(DAY_START.getTime() + MINUTE));
    for (let i = 0; i < 12; i++) {
      await book(BRUNO, {
        startDate: addDays(TODAY, 10 + i * 3),
        endDate: addDays(TODAY, 10 + i * 3),
      });
    }
    await sql`update audit_log set created_at = ${new Date(DAY_START.getTime() + 2 * MINUTE).toISOString()}::timestamptz
      where id > ${old}`.execute(db);
    expect(await undoAsStamped(old, ADMIN, new Date(DAY_START.getTime() + 60 * MINUTE))).toEqual({
      ok: true,
    });
  });

  it("answers notFound for an entry from before today and changes nothing", async () => {
    const id = await book(ANNA);
    const entryId = await latestId();
    await stampEntry(db, entryId, new Date(DAY_START.getTime() - MINUTE));
    const before = await bookingState(id);
    const entries = await entryCount();
    expect(await undoAsStamped(entryId, ADMIN, DAY_START)).toEqual({
      ok: false,
      error: "notFound",
    });
    expect(await bookingState(id)).toEqual(before);
    expect(await entryCount()).toBe(entries);
  });

  it("refuses an older undo while a later change to the same days stands, newest first", async () => {
    const id = await sellPass();
    const sale = await latestId();
    await releaseDays(db, ANNA.id, { bookingId: id, startDate: TODAY, endDate: TODAY }, TODAY);
    const release = await latestId();
    const at = new Date(DAY_START.getTime() + 60 * MINUTE);
    await stampEntry(db, sale, at);
    await stampEntry(db, release, at);
    const now = new Date(at.getTime() + MINUTE);
    expect(await undoAsStamped(sale, ANNA, now)).toEqual({ ok: false, error: "changed" });
    expect(await undoAsStamped(release, ANNA, now)).toEqual({ ok: true });
    expect(await undoAsStamped(sale, ANNA, now)).toEqual({ ok: true });
  });

  it("undoes an undo made today even when the entry it undid is from yesterday", async () => {
    const id = await book(ANNA);
    const original = await latestId();
    await stampToday(db, original, TODAY);
    expect(
      await undoAsStamped(original, ADMIN, new Date(DAY_START.getTime() + 11 * 60 * MINUTE)),
    ).toEqual({ ok: true });
    const undoId = await latestId();
    await stampEntry(db, original, new Date(DAY_START.getTime() - 60 * MINUTE));
    await stampEntry(db, undoId, new Date(DAY_START.getTime() + 11 * 60 * MINUTE));
    const now = new Date(DAY_START.getTime() + 12 * 60 * MINUTE);
    expect(await undoAsStamped(undoId, ADMIN, now)).toEqual({ ok: true });
    expect((await bookingState(id)).status).toBe("active");
  });
});

describe("migration 0007 rollback", () => {
  it("drops the log, keeps the bookings, and migrates up again", async () => {
    const id = await book();
    expect((await createMigrator(db).migrateTo("0006_seasons")).error).toBeUndefined();
    const tables = await sql<{ n: number }>`
      select count(*)::int as n from information_schema.tables where table_name = 'audit_log'`.execute(
      db,
    );
    expect(tables.rows[0].n).toBe(0);
    expect((await bookingState(id)).days).toEqual({ booked: 6 });
    expect((await runMigrations(db, "up")).error).toBeUndefined();
  });
});

describe("migration 0016 (today's activity index)", () => {
  // With sequential scans off, the plan shows the index can serve the query; on a tiny test table
  // the planner would otherwise ignore it.
  async function planOfTodaysList(): Promise<string> {
    return db.transaction().execute(async (tx) => {
      await sql`set local enable_seqscan = off`.execute(tx);
      const { rows } = await sql<{ "QUERY PLAN": string }>`
        explain select id from audit_log where created_at >= ${venueDayStart(TODAY)}
        order by id desc limit 500`.execute(tx);
      return rows.map((row) => row["QUERY PLAN"]).join("\n");
    });
  }

  it("lets today's list read only today's entries, not the whole log", async () => {
    expect(await planOfTodaysList()).toContain("audit_log_created_at_idx");
  });

  it("drops the index on rollback and adds it again", async () => {
    const index = () => sql<{ n: number }>`
      select count(*)::int as n from pg_indexes where indexname = 'audit_log_created_at_idx'`;
    expect((await createMigrator(db).migrateTo("0015_login_lockout")).error).toBeUndefined();
    expect((await index().execute(db)).rows[0].n).toBe(0);
    expect((await runMigrations(db, "up")).error).toBeUndefined();
    expect((await index().execute(db)).rows[0].n).toBe(1);
  });
});
