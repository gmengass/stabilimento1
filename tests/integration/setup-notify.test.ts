import { sql, type Kysely } from "kysely";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, getDb } from "@/db/client";
import { createMigrator, runMigrations } from "@/db/migrator";
import type { DB } from "@/db/types";
import { setDefaultHold } from "@/lib/beach/edit";
import { loadBeach, setupBeach } from "@/lib/beach/layout";
import { createBooking } from "@/lib/booking/bookings";
import { testDatabaseUrl } from "./test-database";

// Setup changes (ADR 0030): beach layout, seasons and prices send `setup_changed`; bookings don't.

const NAME = "0018_setup_notify";
const FENCE = "setup_test_fence";
const WATCHED = ["area", "area_line", "price", "season", "spot", "venue"];
const TODAY = "2027-06-20";
const ANNA = "u-anna";

const TRUNCATE = sql`truncate venue, area, area_line, spot, season, price, booking, booking_spot,
  spot_day, check_in, audit_log, "user" restart identity cascade`;

let db: Kysely<DB>;
let migrated = false;
let listener: pg.Client;
let setupChanged = 0;
let fences = 0;

beforeAll(async () => {
  db = createDb(testDatabaseUrl());
  const result = await runMigrations(db, "up");
  if (result.error) throw result.error;
  migrated = true;
  listener = new pg.Client({ connectionString: testDatabaseUrl() });
  await listener.connect();
  listener.on("notification", ({ channel }) => {
    if (channel === "setup_changed") setupChanged++;
    if (channel === FENCE) fences++;
  });
  await listener.query("LISTEN setup_changed");
  await listener.query(`LISTEN ${FENCE}`);
});

beforeEach(async () => {
  if (!migrated) throw new Error("migrations did not run; refusing to truncate");
  await TRUNCATE.execute(db);
  await db
    .insertInto("user")
    .values({ id: ANNA, name: "Anna", email: "anna@x.invalid", username: "anna" })
    .execute();
  await setupBeach(db, { venueName: "Lido", areaName: "Main", lines: 1, umbrellasPerLine: 3 });
});

afterAll(async () => {
  if (migrated) await TRUNCATE.execute(db);
  await listener?.end();
  await db.destroy();
  await getDb().destroy();
});

/** Once a fence sent afterwards arrives, every earlier notification has arrived too. */
async function settle(): Promise<void> {
  const target = fences + 1;
  await sql`select pg_notify(${FENCE}, '')`.execute(db);
  const until = Date.now() + 5_000;
  while (fences < target) {
    if (Date.now() > until) throw new Error("fence notification never arrived");
    await new Promise((r) => setTimeout(r, 5));
  }
}

async function notificationsDuring(work: () => Promise<unknown>): Promise<number> {
  await settle();
  const start = setupChanged;
  await work();
  await settle();
  return setupChanged - start;
}

async function seasonId(): Promise<number> {
  const venue = await db.selectFrom("venue").select("id").executeTakeFirstOrThrow();
  const row = await db
    .insertInto("season")
    .values({ venue_id: venue.id, name: "2027", start_date: "2027-05-01", end_date: "2027-09-30" })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

async function book() {
  const beach = await loadBeach(db);
  const spotId = beach!.lines[0].spots[0].id;
  const input = {
    customerName: "Rossi",
    customerPhone: "",
    startDate: TODAY,
    endDate: TODAY,
    spots: [{ spotId, sunbeds: 2 }],
  };
  const result = await createBooking(db, ANNA, input, TODAY);
  expect(result).toMatchObject({ ok: true });
}

describe("setup_changed", () => {
  it("one notification for a beach-settings edit", async () => {
    const work = async () =>
      expect(await setDefaultHold(db, { defaultHoldUntil: "12:00" })).toMatchObject({ ok: true });
    expect(await notificationsDuring(work)).toBe(1);
  });

  it("one notification each for a season and for its prices", async () => {
    let id = 0;
    expect(await notificationsDuring(async () => (id = await seasonId()))).toBe(1);
    const prices = () =>
      db
        .insertInto("price")
        .values({ season_id: id, days: 1, single_cents: 2000, bundle_cents: 3000 })
        .execute();
    expect(await notificationsDuring(prices)).toBe(1);
  });

  it("none for booking work", async () => {
    expect(await notificationsDuring(book)).toBe(0);
  });

  it("none for a rolled-back change", async () => {
    const rolledBack = () =>
      expect(
        db.transaction().execute(async (tx) => {
          await sql`update venue set name = 'Lido Nuovo'`.execute(tx);
          throw new Error("roll back");
        }),
      ).rejects.toThrow("roll back");
    expect(await notificationsDuring(rolledBack)).toBe(0);
  });
});

async function setupTriggers(): Promise<string[]> {
  const { rows } = await sql<{ table: string }>`
    select distinct c.relname as table
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_proc p on p.oid = t.tgfoid
    where not t.tgisinternal and p.prosrc ilike '%setup_changed%'
    order by c.relname`.execute(db);
  return rows.map((r) => r.table);
}

describe("the setup-notify migration", () => {
  it("watches exactly the setup tables", async () => {
    expect(await setupTriggers()).toEqual(WATCHED);
  });

  it("down removes the triggers and their function; up restores them", async () => {
    await createMigrator(db).migrateTo(NAME);
    const down = await createMigrator(db).migrateDown();
    if (down.error) throw down.error;
    expect(down.results?.map((r) => [r.migrationName, r.direction, r.status])).toEqual([
      [NAME, "Down", "Success"],
    ]);
    expect(await setupTriggers()).toEqual([]);
    const { rows } = await sql<{ n: number }>`
      select count(*)::int as n from pg_proc where prosrc ilike '%setup_changed%'`.execute(db);
    expect(rows[0]?.n).toBe(0);
    expect(await notificationsDuring(() => sql`update venue set name = name`.execute(db))).toBe(0);

    const up = await runMigrations(db, "up");
    if (up.error) throw up.error;
    expect(await setupTriggers()).toEqual(WATCHED);
  });
});
