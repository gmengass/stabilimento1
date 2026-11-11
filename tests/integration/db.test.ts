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

  it("applies and rolls back the baseline migration", async () => {
    const up = await runMigrations(db, "up");
    expect(up.error).toBeUndefined();
    expect(await appliedMigrations()).toContain("0001_init");

    while ((await appliedMigrations()).length > 0) {
      const down = await runMigrations(db, "down");
      expect(down.error).toBeUndefined();
    }
    expect(await appliedMigrations()).toEqual([]);

    expect((await runMigrations(db, "up")).error).toBeUndefined();
  });

  it("returns date columns as local YYYY-MM-DD strings (ADR 0004)", async () => {
    const { rows } = await sql<{ day: unknown }>`select '2026-08-15'::date as day`.execute(db);
    expect(rows[0]?.day).toBe("2026-08-15");
  });
});
