import { sql, type Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, getDb } from "@/db/client";
import { createMigrator, runMigrations } from "@/db/migrator";
import type { DB } from "@/db/types";
import { testDatabaseUrl } from "./test-database";

let db: Kysely<DB>;

beforeAll(() => {
  db = createDb(testDatabaseUrl());
});

afterAll(async () => {
  await db.destroy();
  await getDb().destroy();
});

async function appliedMigrations(): Promise<string[]> {
  const migrations = await createMigrator(db).getMigrations();
  return migrations.filter((m) => m.executedAt).map((m) => m.name);
}

const SCHEMA_OBJECTS = {
  tables: ["area", "area_line", "spot", "venue"],
  types: ["spot_kind"],
  functions: ["set_updated_at"],
};

async function schemaObjects(): Promise<typeof SCHEMA_OBJECTS> {
  const tables = await sql<{ name: string }>`
    select table_name as name from information_schema.tables
    where table_schema = 'public' and table_name in ('venue', 'area', 'area_line', 'spot')
    order by name
  `.execute(db);
  const types = await sql<{ name: string }>`
    select typname as name from pg_type where typname = 'spot_kind'
  `.execute(db);
  const functions = await sql<{ name: string }>`
    select proname as name from pg_proc where proname = 'set_updated_at'
  `.execute(db);
  return {
    tables: tables.rows.map((r) => r.name),
    types: types.rows.map((r) => r.name),
    functions: functions.rows.map((r) => r.name),
  };
}

describe("database", () => {
  it("connects", async () => {
    const { rows } = await sql<{ one: number }>`select 1 as one`.execute(db);
    expect(rows).toEqual([{ one: 1 }]);
  });

  it("points the app's getDb() at the test database", async () => {
    const { rows } = await sql<{ name: string }>`select current_database() as name`.execute(
      getDb(),
    );
    expect(rows[0]?.name).toMatch(/_test$/);
  });

  it("applies and rolls back every migration", async () => {
    const up = await runMigrations(db, "up");
    expect(up.error).toBeUndefined();
    expect(await appliedMigrations()).toEqual(
      expect.arrayContaining(["0001_init", "0002_venue_area_spot"]),
    );
    expect(await schemaObjects()).toEqual(SCHEMA_OBJECTS);

    while ((await appliedMigrations()).length > 0) {
      const down = await runMigrations(db, "down");
      expect(down.error).toBeUndefined();
    }
    expect(await appliedMigrations()).toEqual([]);
    expect(await schemaObjects()).toEqual({ tables: [], types: [], functions: [] });

    expect((await runMigrations(db, "up")).error).toBeUndefined();
    expect(await schemaObjects()).toEqual(SCHEMA_OBJECTS);
  });

  it("returns date columns as local YYYY-MM-DD strings (ADR 0004)", async () => {
    const { rows } = await sql<{ day: unknown }>`select '2026-08-15'::date as day`.execute(db);
    expect(rows[0]?.day).toBe("2026-08-15");
  });
});
