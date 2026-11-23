import { sql, type Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appRoleName, grantAppRole } from "@/db/app-role";
import { createDb, getDb } from "@/db/client";
import { runMigrations } from "@/db/migrator";
import type { DB } from "@/db/types";
import { testDatabaseUrl } from "./test-database";

const PASSWORD = "test0only0app0password0123";

let owner: Kysely<DB>;
let app: Kysely<DB>;
let role: string;

beforeAll(async () => {
  owner = createDb(testDatabaseUrl());
  const result = await runMigrations(owner, "up");
  if (result.error) throw result.error;
  role = await grantAppRole(owner, PASSWORD);
  const url = new URL(testDatabaseUrl());
  url.username = role;
  url.password = PASSWORD;
  app = createDb(url.toString());
});

afterAll(async () => {
  await app.destroy();
  await owner.destroy();
  await getDb().destroy();
});

const refused = (query: Promise<unknown>) =>
  expect(query).rejects.toMatchObject({ code: expect.stringMatching(/^42501$|^0LP01$/) });

describe("the app's database role (ADR 0028)", () => {
  it("is named after the database", () => {
    expect(role).toBe(appRoleName(new URL(testDatabaseUrl()).pathname.slice(1)));
  });

  it("reads and writes the app's tables", async () => {
    await app.transaction().execute(async (trx) => {
      await sql`insert into login_failure (key, failures, first_failed_at)
        values ('app-role-test', 1, now())`.execute(trx);
      await sql`update login_failure set failures = 2 where key = 'app-role-test'`.execute(trx);
      await sql`delete from login_failure where key = 'app-role-test'`.execute(trx);
      await sql`select count(*) from booking`.execute(trx);
      await sql`lock table venue in exclusive mode`.execute(trx);
    });
  });

  it("is not a superuser and can't create roles or databases", async () => {
    const { rows } = await sql<{
      rolsuper: boolean;
      rolcreaterole: boolean;
      rolcreatedb: boolean;
    }>`select rolsuper, rolcreaterole, rolcreatedb from pg_roles where rolname = ${role}`.execute(
      owner,
    );
    expect(rows[0]).toEqual({ rolsuper: false, rolcreaterole: false, rolcreatedb: false });
  });

  it("can't change the schema", async () => {
    await refused(sql`create table app_role_probe (id int)`.execute(app));
    await refused(sql`alter table booking add column probe int`.execute(app));
    await refused(sql`drop table booking`.execute(app));
    await refused(sql`truncate booking`.execute(app));
  });

  it("can't rewrite the migration history", async () => {
    await sql`select count(*) from kysely_migration`.execute(app);
    await refused(sql`delete from kysely_migration`.execute(app));
  });

  it("can't run programs or read files on the database container", async () => {
    await refused(sql`copy (select 1) to program 'true'`.execute(app));
    await refused(sql`select pg_read_file('/etc/passwd')`.execute(app));
  });

  it("is granted tables created by later migrations", async () => {
    await sql`create table app_role_later (id int)`.execute(owner);
    try {
      await sql`insert into app_role_later values (1)`.execute(app);
    } finally {
      await sql`drop table app_role_later`.execute(owner);
    }
  });

  it("can be granted again without changes or errors", async () => {
    await expect(grantAppRole(owner)).resolves.toBe(role);
    await expect(grantAppRole(owner, PASSWORD)).resolves.toBe(role);
    await sql`select 1`.execute(app);
  });

  it("refuses a password that can't be inlined safely", async () => {
    await expect(grantAppRole(owner, "short")).rejects.toThrow(/APP_DB_PASSWORD/);
    await expect(grantAppRole(owner, `${"a".repeat(24)}' superuser --`)).rejects.toThrow(
      /APP_DB_PASSWORD/,
    );
  });
});
