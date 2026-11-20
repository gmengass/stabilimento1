import { sql, type Kysely } from "kysely";

// Communal (shared tablet) accounts and who is acting on them (ADR 0024). `acting_staff` holds
// at most one chosen staff member per session and goes with the session.

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table "user"
    add column communal boolean not null default false,
    add constraint user_communal_staff_only check (not communal or role is distinct from 'admin')`.execute(
    db,
  );
  await sql`create table acting_staff (
    session_id text primary key references session (id) on delete cascade,
    staff_user_id text not null references "user" (id) on delete cascade,
    last_used_at timestamptz not null default now()
  )`.execute(db);
  await sql`create index acting_staff_staff_user_id_idx on acting_staff (staff_user_id)`.execute(
    db,
  );
}

/** Forgets who was acting on each tablet and the communal flags; the audit log is untouched. */
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop table acting_staff`.execute(db);
  await sql`alter table "user" drop constraint user_communal_staff_only, drop column communal`.execute(
    db,
  );
}
