import { sql, type Kysely } from "kysely";

// Failed sign-ins per username, so a password can't be guessed from many addresses. Any
// username typed is tracked, existing or not, so a lock never confirms that an account exists.

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`create table login_failure (
    username text primary key,
    failures integer not null check (failures > 0),
    first_failed_at timestamptz not null,
    locked_until timestamptz
  )`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop table login_failure`.execute(db);
}
