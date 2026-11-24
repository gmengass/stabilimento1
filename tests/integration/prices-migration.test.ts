import { sql, type Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, getDb } from "@/db/client";
import { createMigrator, runMigrations } from "@/db/migrator";
import type { DB } from "@/db/types";
import { testDatabaseUrl } from "./test-database";

const CHECK_VIOLATION = "23514";
const UNIQUE_VIOLATION = "23505";
const MIGRATION_BEFORE_PRICES = "0016_audit_log_created_at";
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
  await sql`truncate price, season, venue, booking, booking_spot, spot_day, audit_log, "user"
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

async function insertSeason(): Promise<number> {
  const venue = await db
    .insertInto("venue")
    .values({ name: "Lido", slug: "lido" })
    .returning("id")
    .executeTakeFirstOrThrow();
  const season = await db
    .insertInto("season")
    .values({ venue_id: venue.id, name: "2027", start_date: "2027-06-01", end_date: "2027-09-15" })
    .returning("id")
    .executeTakeFirstOrThrow();
  return season.id;
}

function insertPrice(seasonId: number, days: number | null, single = 1000, bundle = 3000) {
  return db
    .insertInto("price")
    .values({ season_id: seasonId, days, single_cents: single, bundle_cents: bundle })
    .execute();
}

async function insertBooking(): Promise<number> {
  const row = await db
    .insertInto("booking")
    .values({
      kind: "day",
      customer_name: "Rossi",
      customer_phone: "333",
      start_date: "2027-07-10",
      end_date: "2027-07-10",
      created_by: USER,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

async function hasTable(): Promise<boolean> {
  const { rows } = await sql<{ n: number }>`
    select count(*)::int as n from information_schema.tables where table_name = 'price'`.execute(
    db,
  );
  return rows[0].n === 1;
}

describe("0017_prices_paid migration", () => {
  it("keeps one row per season and number of days, and one season row", async () => {
    const season = await insertSeason();
    await insertPrice(season, 1);
    await insertPrice(season, null);
    await expect(insertPrice(season, 1)).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
    await expect(insertPrice(season, null)).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it.each([0, 32])("rejects a row for %d days", async (days) => {
    const season = await insertSeason();
    await expect(insertPrice(season, days)).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it("rejects negative prices", async () => {
    const season = await insertSeason();
    await expect(insertPrice(season, 1, -1)).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it("needs who and when together for a paid booking", async () => {
    const id = await insertBooking();
    const at = new Date();
    await expect(
      db.updateTable("booking").set({ paid_at: at }).where("id", "=", id).execute(),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
    await expect(
      db.updateTable("booking").set({ paid_suggested_cents: 100 }).where("id", "=", id).execute(),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
    await db
      .updateTable("booking")
      .set({ paid_at: at, paid_by: USER, paid_suggested_cents: 100 })
      .where("id", "=", id)
      .execute();
  });

  it("rolls back with prices and paid entries present, then migrates up again", async () => {
    const season = await insertSeason();
    await insertPrice(season, 1);
    const booking = await insertBooking();
    await db
      .updateTable("booking")
      .set({ paid_at: new Date(), paid_by: USER })
      .where("id", "=", booking)
      .execute();
    const book = await db
      .insertInto("audit_log")
      .values({ user_id: USER, action: "book", booking_id: booking })
      .returning("id")
      .executeTakeFirstOrThrow();
    const paid = await db
      .insertInto("audit_log")
      .values({ user_id: USER, action: "paid", booking_id: booking })
      .returning("id")
      .executeTakeFirstOrThrow();
    const undo = await db
      .insertInto("audit_log")
      .values({ user_id: USER, action: "undo", booking_id: booking, undoes_id: paid.id })
      .returning("id")
      .executeTakeFirstOrThrow();
    await db
      .updateTable("audit_log")
      .set({ undone_by_id: undo.id })
      .where("id", "=", paid.id)
      .execute();
    try {
      const down = await createMigrator(db).migrateTo(MIGRATION_BEFORE_PRICES);
      if (down.error) throw down.error;
      expect(await hasTable()).toBe(false);
      const left = await db.selectFrom("audit_log").select("id").execute();
      expect(left.map((r) => r.id)).toEqual([book.id]);
    } finally {
      const up = await runMigrations(db, "up");
      if (up.error) throw up.error;
    }
    expect(await hasTable()).toBe(true);
    const row = await db
      .selectFrom("booking")
      .select("paid_at")
      .where("id", "=", booking)
      .executeTakeFirstOrThrow();
    expect(row.paid_at).toBeNull();
  });
});
