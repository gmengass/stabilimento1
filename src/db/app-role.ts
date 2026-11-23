import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { sql, type Kysely } from "kysely";

/**
 * The app connects as `<database>_app`: it may read and write the tables, never change the
 * schema, the migration history, the audit trail, roles or files. A leaked DATABASE_URL or an
 * SQL injection then can't take over the database or run programs on its container (ADR 0028).
 * Migrations and backups keep using the owner account.
 *
 * Granted after every migration run, not in a migration: the grants must follow new tables,
 * and a database restored from a backup made before this existed has none.
 */
export function appRoleName(database: string): string {
  return `${database}_app`;
}

const MIGRATION_TABLES = ["kysely_migration", "kysely_migration_lock"];

/** What `openssl rand -hex 24` makes. */
const APP_PASSWORD = /^[A-Za-z0-9_-]{24,128}$/;

export interface AppAccount {
  user: string;
  password: string;
}

/**
 * The account in APP_DATABASE_URL (the app's own connection string, ADR 0028), or why it can't
 * be used. The .env.example placeholder is published, so it is refused like a short password.
 */
export function parseAppDatabaseUrl(raw: string): AppAccount | string {
  if (!URL.canParse(raw)) return "APP_DATABASE_URL is not a URL";
  const url = new URL(raw);
  const user = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  if (!/^postgres(ql)?:$/.test(url.protocol)) return "APP_DATABASE_URL must be postgresql://";
  if (!/^[a-z0-9_]{1,63}$/.test(user)) return "APP_DATABASE_URL has no valid user name";
  if (password.startsWith("change-me"))
    return "APP_DATABASE_URL still has the .env.example password";
  if (!APP_PASSWORD.test(password)) {
    return "APP_DATABASE_URL's password must be 24 to 128 letters, digits, _ or - (openssl rand -hex 24)";
  }
  return { user, password };
}

const SCRAM_ITERATIONS = 4096;

/**
 * Postgres's stored form of a password (SCRAM-SHA-256), computed here so the password itself is
 * never sent in SQL, where a failed or logged statement would write it to the server log.
 */
export function scramVerifier(password: string, salt: Buffer = randomBytes(16)): string {
  const salted = pbkdf2Sync(password, salt, SCRAM_ITERATIONS, 32, "sha256");
  const clientKey = createHmac("sha256", salted).update("Client Key").digest();
  const storedKey = createHash("sha256").update(clientKey).digest();
  const serverKey = createHmac("sha256", salted).update("Server Key").digest();
  const b64 = (buffer: Buffer) => buffer.toString("base64");
  return `SCRAM-SHA-256$${SCRAM_ITERATIONS}:${b64(salt)}$${b64(storedKey)}:${b64(serverKey)}`;
}

/**
 * Creates the app role if missing, sets its password when given, and adds its grants; safe to
 * run any number of times. It only adds what the app needs and takes back the writes it must
 * never make; privileges granted to the role by hand are left alone.
 */
export async function grantAppRole<T>(db: Kysely<T>, account?: AppAccount): Promise<string> {
  const { rows } = await sql<{ name: string }>`select current_database() as name`.execute(db);
  const database = sql.id(rows[0]!.name);
  const role = appRoleName(rows[0]!.name);
  if (account && account.user !== role) {
    throw new Error(`APP_DATABASE_URL must use the user ${role}, not ${account.user}`);
  }
  const password = account?.password;
  const id = sql.id(role);
  const existing = await sql`select 1 from pg_roles where rolname = ${role}`.execute(db);
  if (existing.rows.length === 0) await sql`create role ${id}`.execute(db);
  await sql`alter role ${id} nosuperuser nocreatedb nocreaterole noreplication nobypassrls`.execute(
    db,
  );
  if (password) {
    // ALTER ROLE takes no parameters; the password is checked by parseAppDatabaseUrl and the
    // verifier is base64 and `$:` only.
    await sql`alter role ${id} login password ${sql.lit(scramVerifier(password))}`.execute(db);
  }
  // Only the owner and the app may connect to this database, and nobody needs temp tables.
  await sql`revoke connect, temporary on database ${database} from public`.execute(db);
  await sql`grant connect on database ${database} to ${id}`.execute(db);
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
  // The trail of who did what: appended to, and marked undone (`undo.ts`), never rewritten.
  await sql`revoke update, delete, truncate on table audit_log from ${id}`.execute(db);
  await sql`grant update (undone_by_id) on table audit_log to ${id}`.execute(db);
  return role;
}
