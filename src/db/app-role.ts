import { sql, type Kysely } from "kysely";

/**
 * The app connects as `<database>_app`: it may read and write the tables, never change the
 * schema, the migration history, roles or files. A leaked DATABASE_URL or an SQL injection then
 * can't take over the database or run programs on its container (ADR 0028). Migrations and
 * backups keep using the owner account.
 *
 * Granted after every migration run, not in a migration: the grants must follow new tables,
 * and a database restored from a backup made before this existed has none.
 */
export function appRoleName(database: string): string {
  return `${database}_app`;
}

const MIGRATION_TABLES = ["kysely_migration", "kysely_migration_lock"];

/** What `openssl rand -hex 24` makes; also safe inside the app's DATABASE_URL. */
export const APP_PASSWORD = /^[A-Za-z0-9_-]{24,128}$/;
export const APP_PASSWORD_RULE =
  "APP_DB_PASSWORD must be 24 to 128 letters, digits, _ or - (openssl rand -hex 24)";

/** Creates or updates the app role and its grants; safe to run any number of times. */
export async function grantAppRole<T>(db: Kysely<T>, password?: string): Promise<string> {
  const { rows } = await sql<{ name: string }>`select current_database() as name`.execute(db);
  const role = appRoleName(rows[0]!.name);
  const id = sql.id(role);
  const existing = await sql`select 1 from pg_roles where rolname = ${role}`.execute(db);
  if (existing.rows.length === 0) await sql`create role ${id}`.execute(db);
  await sql`alter role ${id} nosuperuser nocreatedb nocreaterole noreplication nobypassrls`.execute(
    db,
  );
  if (password) {
    // ALTER ROLE takes no parameters, so the password is inlined: only safe characters allowed.
    if (!APP_PASSWORD.test(password)) throw new Error(APP_PASSWORD_RULE);
    await sql`alter role ${id} login password ${sql.lit(password)}`.execute(db);
  }
  await sql`grant connect on database ${sql.id(rows[0]!.name)} to ${id}`.execute(db);
  await sql`grant usage on schema public to ${id}`.execute(db);
  await sql`grant select, insert, update, delete on all tables in schema public to ${id}`.execute(
    db,
  );
  await sql`grant usage, select on all sequences in schema public to ${id}`.execute(db);
  await sql`alter default privileges in schema public
    grant select, insert, update, delete on tables to ${id}`.execute(db);
  await sql`alter default privileges in schema public grant usage, select on sequences to ${id}`.execute(
    db,
  );
  for (const table of MIGRATION_TABLES) {
    await sql`revoke insert, update, delete, truncate on table ${sql.id(table)} from ${id}`.execute(
      db,
    );
  }
  return role;
}
