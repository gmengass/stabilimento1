import { readdirSync } from "node:fs";
import path from "node:path";
import { sql, type Kysely } from "kysely";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, getDb } from "@/db/client";
import { createMigrator, runMigrations } from "@/db/migrator";
import type { DB } from "@/db/types";
import { setDefaultHold } from "@/lib/beach/edit";
import { loadBeach, setupBeach } from "@/lib/beach/layout";
import { listActivity, type Viewer } from "@/lib/booking/audit";
import { cancelBooking, createBooking, type CreateBookingInput } from "@/lib/booking/bookings";
import { checkIn } from "@/lib/booking/check-in";
import { applyHoldRule } from "@/lib/booking/hold";
import { moveBooking } from "@/lib/booking/move";
import { undoEntry } from "@/lib/booking/undo";
import { stampToday } from "./audit-clock";
import { testDatabaseUrl } from "./test-database";

const MIGRATIONS = path.join(import.meta.dirname, "../../src/db/migrations");
const BEFORE = "0009_check_in";
const LIVE_PREFIX = "0010_";
const FENCE = "live_test_fence";

/** Every table whose changes the map shows. */
const WATCHED = [
  "area",
  "area_line",
  "audit_log",
  "booking",
  "booking_spot",
  "check_in",
  "season",
  "spot",
  "spot_day",
  "venue",
];

const TRUNCATE = sql`truncate venue, area, area_line, spot, season, booking, booking_spot,
  spot_day, check_in, audit_log, "user" restart identity cascade`;

/** A Sunday in summer: Europe/Rome is UTC+2. */
const TODAY = "2027-06-20";
const ANNA: Viewer = { id: "u-anna", role: "staff" };
const rome = (time: string) => new Date(`${TODAY}T${time}+02:00`);

let db: Kysely<DB>;
let migrated = false;
let listener: pg.Client;
let mapChanged = 0;
let fences = 0;
/** Spot id by umbrella number. */
let spot: Record<number, number>;

beforeAll(async () => {
  db = createDb(testDatabaseUrl());
  const result = await runMigrations(db, "up");
  if (result.error) throw result.error;
  migrated = true;
  listener = new pg.Client({ connectionString: testDatabaseUrl() });
  await listener.connect();
  listener.on("notification", ({ channel }) => {
    if (channel === "map_changed") mapChanged++;
    if (channel === FENCE) fences++;
  });
  await listener.query("LISTEN map_changed");
  await listener.query(`LISTEN ${FENCE}`);
});

beforeEach(async () => {
  if (!migrated) throw new Error("migrations did not run; refusing to truncate");
  await TRUNCATE.execute(db);
  await db
    .insertInto("user")
    .values({ id: ANNA.id, name: "Anna", email: "anna@x.invalid", username: "anna" })
    .execute();
  await setupBeach(db, { venueName: "Lido", areaName: "Main", lines: 2, umbrellasPerLine: 5 });
  const beach = await loadBeach(db);
  if (!beach) throw new Error("no beach");
  spot = Object.fromEntries(beach.lines.flatMap((l) => l.spots.map((s) => [s.number, s.id])));
});

afterAll(async () => {
  // 0009's down refuses while check-ins or no-shows exist; db.test.ts rolls back.
  if (migrated) await TRUNCATE.execute(db);
  await listener?.end();
  await db.destroy();
  await getDb().destroy();
});

/**
 * Waits until every notification committed so far has reached the listener: Postgres delivers
 * them in commit order, so once a fence sent afterwards arrives, nothing earlier is in flight.
 */
async function settle(): Promise<void> {
  const target = fences + 1;
  await sql`select pg_notify(${FENCE}, '')`.execute(db);
  const until = Date.now() + 5_000;
  while (fences < target) {
    if (Date.now() > until) throw new Error("fence notification never arrived");
    await new Promise((r) => setTimeout(r, 5));
  }
}

/** How many map_changed notifications `work` caused. */
async function notificationsDuring(work: () => Promise<unknown>): Promise<number> {
  await settle();
  const start = mapChanged;
  await work();
  await settle();
  return mapChanged - start;
}

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

async function book(overrides: Partial<CreateBookingInput> = {}) {
  const result = await createBooking(db, ANNA.id, booking(overrides), TODAY);
  if (!result.ok) throw new Error(`booking failed: ${result.error}`);
  return result.bookingId;
}

async function expectOk(promise: Promise<{ ok: boolean }>) {
  const result = await promise;
  expect(result).toMatchObject({ ok: true });
}

describe("map_changed: one notification per committed change", () => {
  it("creating a booking (booking, booking_spot, spot_day, audit_log rows)", async () => {
    expect(await notificationsDuring(() => book())).toBe(1);
  });

  it("a multi-day, two-umbrella booking", async () => {
    const work = () =>
      book({
        endDate: "2027-06-24",
        spots: [
          { spotId: spot[101], sunbeds: 2 },
          { spotId: spot[102], sunbeds: 1 },
        ],
      });
    expect(await notificationsDuring(work)).toBe(1);
  });

  it("cancelling", async () => {
    const id = await book();
    const work = () => expectOk(cancelBooking(db, ANNA.id, { bookingId: id }, TODAY));
    expect(await notificationsDuring(work)).toBe(1);
  });

  it("moving to another umbrella", async () => {
    const id = await book();
    const input = { bookingId: id, spots: [{ fromSpotId: spot[101], toSpotId: spot[103] }] };
    const work = () => expectOk(moveBooking(db, ANNA.id, input, TODAY));
    expect(await notificationsDuring(work)).toBe(1);
  });

  it("undoing", async () => {
    await book();
    const [entry] = await listActivity(db, new Date(0), 1);
    await stampToday(db, entry.id, TODAY);
    const work = () => expectOk(undoEntry(db, ANNA, { entryId: entry.id }, TODAY, new Date()));
    expect(await notificationsDuring(work)).toBe(1);
  });

  it("checking in", async () => {
    const id = await book();
    const work = () => expectOk(checkIn(db, ANNA.id, { bookingId: id, date: TODAY }, TODAY));
    expect(await notificationsDuring(work)).toBe(1);
  });

  it("the hold rule flagging no-shows", async () => {
    await book();
    await book({ spots: [{ spotId: spot[105], sunbeds: 1 }] });
    let run;
    const work = async () => (run = await applyHoldRule(db, rome("11:00:00")));
    expect(await notificationsDuring(work)).toBe(1);
    expect(run).toEqual({ bookings: 2, umbrellas: 2 });
  });

  it("a beach-settings edit: the default check-in time", async () => {
    const work = () => expectOk(setDefaultHold(db, { defaultHoldUntil: "12:00" }));
    expect(await notificationsDuring(work)).toBe(1);
  });

  it("two separate commits notify twice", async () => {
    const work = async () => {
      await book();
      await book({ spots: [{ spotId: spot[102], sunbeds: 1 }] });
    };
    expect(await notificationsDuring(work)).toBe(2);
  });
});

describe("map_changed: nothing for changes that never happened", () => {
  const renameVenue = (tx: Kysely<DB>) => sql`update venue set name = 'Lido Nuovo'`.execute(tx);

  it("a rolled-back transaction notifies nobody (a committed one does)", async () => {
    const rolledBack = () =>
      expect(
        db.transaction().execute(async (tx) => {
          await renameVenue(tx);
          throw new Error("roll back");
        }),
      ).rejects.toThrow("roll back");
    const committed = () => db.transaction().execute(renameVenue);
    expect([await notificationsDuring(rolledBack), await notificationsDuring(committed)]).toEqual([
      0, 1,
    ]);
  });

  it("a refused double booking notifies nobody", async () => {
    const first = await notificationsDuring(() => book());
    const refused = await notificationsDuring(async () => {
      const result = await createBooking(db, ANNA.id, booking(), TODAY);
      expect(result).toMatchObject({ ok: false, error: "taken" });
    });
    expect([first, refused]).toEqual([1, 0]);
  });

  it("of two concurrent bookings for one umbrella, only the winner notifies", async () => {
    const work = async () => {
      const results = await Promise.all(
        Array.from({ length: 4 }, () => createBooking(db, ANNA.id, booking(), TODAY)),
      );
      expect(results.filter((r) => r.ok)).toHaveLength(1);
    };
    expect(await notificationsDuring(work)).toBe(1);
  });
});

function liveMigration(): string {
  const name = readdirSync(MIGRATIONS).find((file) => file.startsWith(LIVE_PREFIX));
  if (!name) throw new Error(`no ${LIVE_PREFIX}* migration in src/db/migrations`);
  return name.replace(/\.ts$/, "");
}

/** Non-internal triggers whose function sends map_changed, as table → OR of tgtype bits. */
async function notifyTriggers(): Promise<Record<string, number>> {
  const { rows } = await sql<{ table: string; type: number }>`
    select c.relname as table, bit_or(t.tgtype::int) as type
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_proc p on p.oid = t.tgfoid
    where not t.tgisinternal and p.prosrc ilike '%map_changed%'
    group by c.relname order by c.relname`.execute(db);
  return Object.fromEntries(rows.map((r) => [r.table, r.type]));
}

async function notifyFunctions(): Promise<number> {
  const { rows } = await sql<{ n: number }>`
    select count(*)::int as n from pg_proc where prosrc ilike '%map_changed%'`.execute(db);
  return rows[0]?.n ?? 0;
}

// pg_trigger.tgtype bits.
const ROW = 1;
const BEFORE_BIT = 2;
const WRITES = 4 | 8 | 16; // insert, delete, update

describe("the live-map migration", () => {
  it("adds statement-level AFTER insert/update/delete triggers on every watched table", async () => {
    liveMigration();
    const triggers = await notifyTriggers();
    expect(Object.keys(triggers)).toEqual(WATCHED);
    for (const [table, type] of Object.entries(triggers)) {
      expect({ table, row: type & ROW, before: type & BEFORE_BIT }).toEqual({
        table,
        row: 0,
        before: 0,
      });
      expect({ table, writes: type & WRITES }).toEqual({ table, writes: WRITES });
    }
  });

  it("down removes the triggers and their function; up restores them", async () => {
    const name = liveMigration();
    const down = await createMigrator(db).migrateTo(BEFORE);
    if (down.error) throw down.error;
    expect(down.results?.map((r) => [r.migrationName, r.direction, r.status])).toContainEqual([
      name,
      "Down",
      "Success",
    ]);
    expect(await notifyTriggers()).toEqual({});
    expect(await notifyFunctions()).toBe(0);
    // Raw SQL: rolling back to BEFORE also drops later columns the app writes (e.g. deckchairs).
    expect(await notificationsDuring(() => sql`update venue set name = name`.execute(db))).toBe(0);

    const up = await runMigrations(db, "up");
    if (up.error) throw up.error;
    expect(Object.keys(await notifyTriggers())).toEqual(WATCHED);
    expect(
      await notificationsDuring(() => book({ spots: [{ spotId: spot[102], sunbeds: 1 }] })),
    ).toBe(1);
  });
});
