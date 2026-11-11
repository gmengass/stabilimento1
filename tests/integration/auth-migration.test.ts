import { sql, type Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, getDb } from "@/db/client";
import { createMigrator, runMigrations } from "@/db/migrator";
import type { DB } from "@/db/types";
import { truncateAuth } from "./auth-fixtures";
import { testDatabaseUrl } from "./test-database";

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";

const AUTH_TABLES = ["account", "session", "user", "verification"];
const MIGRATION_BEFORE_AUTH = "0002_venue_area_spot";

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
  await truncateAuth(db);
});

afterAll(async () => {
  await db.destroy();
  await getDb().destroy();
});

async function authTables(): Promise<string[]> {
  const { rows } = await sql<{ table_name: string }>`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_name in ('user', 'session', 'account', 'verification')
    order by table_name
  `.execute(db);
  return rows.map((r) => r.table_name);
}

interface UserInput {
  id?: string;
  username?: string;
  role?: string;
  locale?: string;
}

function insertUser({ id = "u1", username = "anna", role, locale }: UserInput = {}) {
  return sql`
    insert into "user" (id, name, email, username, role, locale)
    values (${id}, 'Anna', ${`${id}@staff.invalid`}, ${username},
            ${role ?? "staff"}, ${locale ?? "it"})
  `.execute(db);
}

describe("0003_auth migration", () => {
  it("round-trips up, down, up", async () => {
    expect(await authTables()).toEqual(AUTH_TABLES);

    const down = await createMigrator(db).migrateTo(MIGRATION_BEFORE_AUTH);
    if (down.error) throw down.error;
    expect(down.results?.map((r) => [r.migrationName, r.direction, r.status])).toContainEqual([
      "0003_auth",
      "Down",
      "Success",
    ]);
    expect(await authTables()).toEqual([]);

    const up = await runMigrations(db, "up");
    if (up.error) throw up.error;
    expect(await authTables()).toEqual(AUTH_TABLES);
  });

  it("defaults role to staff and locale to it", async () => {
    await sql`
      insert into "user" (id, name, email, username) values ('u1', 'Anna', 'a@staff.invalid', 'anna')
    `.execute(db);
    const { rows } = await sql<{ role: string; locale: string; banned: boolean }>`
      select role, locale, banned from "user" where id = 'u1'
    `.execute(db);
    expect(rows[0]).toEqual({ role: "staff", locale: "it", banned: false });
  });

  it("rejects role 'owner'", async () => {
    await expect(insertUser({ role: "owner" })).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it("rejects locale 'fr'", async () => {
    await expect(insertUser({ locale: "fr" })).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it("rejects a duplicate username", async () => {
    await insertUser({ id: "u1", username: "anna" });
    await expect(insertUser({ id: "u2", username: "anna" })).rejects.toMatchObject({
      code: UNIQUE_VIOLATION,
    });
  });

  it.each(["Anna", "an", "a".repeat(31), "an na", "an-na"])(
    "rejects username %j",
    async (username) => {
      await expect(insertUser({ username })).rejects.toMatchObject({ code: CHECK_VIOLATION });
    },
  );

  it("deletes a user's sessions with the user", async () => {
    await insertUser();
    await sql`
      insert into session (id, user_id, token, expires_at)
      values ('s1', 'u1', 't1', '2030-01-01T00:00:00Z')
    `.execute(db);
    await sql`delete from "user" where id = 'u1'`.execute(db);
    const { rows } = await sql<{ n: number }>`select count(*)::int as n from session`.execute(db);
    expect(rows[0]?.n).toBe(0);
  });
});
