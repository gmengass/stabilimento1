import { sql, type Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
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
  role = appRoleName(new URL(testDatabaseUrl()).pathname.slice(1));
  await grantAppRole(owner, { user: role, password: PASSWORD });
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
    await expect(grantAppRole(owner, { user: role, password: PASSWORD })).resolves.toBe(role);
    await sql`select 1`.execute(app);
  });

  it("refuses an account named for another database", async () => {
    await expect(grantAppRole(owner, { user: "other_app", password: PASSWORD })).rejects.toThrow(
      /must use the user/,
    );
  });

  it("appends to the audit trail and marks entries undone, but never rewrites or deletes it", async () => {
    await sql`update audit_log set undone_by_id = null where false`.execute(app);
    await refused(sql`update audit_log set action = action where false`.execute(app));
    await refused(sql`delete from audit_log where false`.execute(app));
    await refused(sql`truncate audit_log`.execute(app));
  });

  it("can't make temp tables", async () => {
    await refused(sql`create temp table app_role_temp (id int)`.execute(app));
  });
});

describe("migrate.ts with APP_DATABASE_URL", () => {
  const migrate = (command: string, appUrl: string) =>
    spawnSync("node", ["--import", "tsx", "src/db/migrate.ts", command], {
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: testDatabaseUrl(), APP_DATABASE_URL: appUrl },
    });
  const appUrl = (password: string) => {
    const url = new URL(testDatabaseUrl());
    url.username = role;
    url.password = password;
    return url.toString();
  };

  it("grants the account and sets its password", () => {
    const result = migrate("grant", appUrl(PASSWORD));
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(`granted ${role}`);
  });

  it("refuses the .env.example password or a short one before touching the database", () => {
    for (const password of ["change-me-app-0123456789ab", "short"]) {
      const result = migrate("up", appUrl(password));
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/APP_DATABASE_URL/);
      expect(result.stdout).not.toMatch(/granted|Nothing to do/);
    }
  });
});
