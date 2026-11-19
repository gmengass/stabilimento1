import { sql, type Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, getDb } from "@/db/client";
import { createMigrator, runMigrations } from "@/db/migrator";
import type { DB } from "@/db/types";
import { testDatabaseUrl } from "./test-database";

const CHECK_VIOLATION = "23514";
const MIGRATION_BEFORE_DECKCHAIRS = "0010_live_notify";
const USER = "u-staff";

let db: Kysely<DB>;
let migrated = false;

beforeAll(async () => {
  db = createDb(testDatabaseUrl());
  const result = await runMigrations(db, "up");
  if (result.error) throw result.error;
  migrated = true;
});

beforeEach(async () => {
  if (!migrated) throw new Error("migrations did not run; refusing to truncate");
  await sql`truncate booking, booking_spot, spot_day, audit_log, "user"
    restart identity cascade`.execute(db);
  await db
    .insertInto("user")
    .values({ id: USER, name: "Anna", email: "anna@example.invalid", username: "anna" })
    .execute();
});

afterAll(async () => {
  if (migrated) {
    const up = await runMigrations(db, "up");
    if (up.error) throw up.error;
  }
  await db.destroy();
  await getDb().destroy();
});

/** A booking written without naming deckchairs, as code before 0011 did. */
function insertBooking(name = "Rossi") {
  return sql`insert into booking (kind, customer_name, start_date, end_date, created_by)
    values ('day', ${name}, '2027-07-10', '2027-07-10', ${USER})`.execute(db);
}

function setDeckchairs(deckchairs: number) {
  return sql`update booking set deckchairs = ${deckchairs}`.execute(db);
}

async function deckchairs(): Promise<number[]> {
  const { rows } = await sql<{ deckchairs: number }>`
    select deckchairs from booking order by id`.execute(db);
  return rows.map((r) => r.deckchairs);
}

async function hasColumn(): Promise<boolean> {
  const { rows } = await sql<{ n: number }>`
    select count(*)::int as n from information_schema.columns
    where table_name = 'booking' and column_name = 'deckchairs'`.execute(db);
  return rows[0].n === 1;
}

describe("0011_booking_deckchairs migration", () => {
  it("gives bookings that existed before it 0 deckchairs", async () => {
    try {
      const down = await createMigrator(db).migrateTo(MIGRATION_BEFORE_DECKCHAIRS);
      if (down.error) throw down.error;
      expect(await hasColumn()).toBe(false);
      await insertBooking("Rossi");
      await insertBooking("Bianchi");
    } finally {
      const up = await runMigrations(db, "up");
      if (up.error) throw up.error;
    }
    expect(await deckchairs()).toEqual([0, 0]);
  });

  it("defaults a new booking to 0 and accepts 0 to 40", async () => {
    await insertBooking();
    expect(await deckchairs()).toEqual([0]);
    await setDeckchairs(40);
    expect(await deckchairs()).toEqual([40]);
  });

  it.each([41, -1])("rejects %d deckchairs", async (value) => {
    await insertBooking();
    await expect(setDeckchairs(value)).rejects.toMatchObject({ code: CHECK_VIOLATION });
    expect(await deckchairs()).toEqual([0]);
  });

  it("rejects null deckchairs", async () => {
    await insertBooking();
    await expect(sql`update booking set deckchairs = null`.execute(db)).rejects.toMatchObject({
      code: "23502",
    });
  });

  it("rolls back with deckchairs present, keeps the bookings, then migrates up again", async () => {
    await insertBooking();
    await setDeckchairs(2);
    try {
      const down = await createMigrator(db).migrateTo(MIGRATION_BEFORE_DECKCHAIRS);
      if (down.error) throw down.error;
      expect(down.results?.map((r) => [r.migrationName, r.direction, r.status])).toContainEqual([
        "0011_booking_deckchairs",
        "Down",
        "Success",
      ]);
      expect(await hasColumn()).toBe(false);
      const { rows } = await sql<{ n: number }>`select count(*)::int as n from booking`.execute(db);
      expect(rows[0].n).toBe(1);
    } finally {
      const up = await runMigrations(db, "up");
      if (up.error) throw up.error;
    }
    expect(await hasColumn()).toBe(true);
    expect(await deckchairs()).toEqual([0]);
  });
});
