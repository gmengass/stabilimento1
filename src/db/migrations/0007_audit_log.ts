import { sql, type Kysely } from "kysely";

// The AuditLog of ADR 0004, with the change data undo needs (ADR 0013). `change` is null for
// entries that can't be undone (beach settings, seasons). No customer data is copied here.

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`create table audit_log (
    id integer generated always as identity primary key,
    created_at timestamptz not null default now(),
    user_id text not null references "user" (id) on delete restrict,
    action text not null check (action in
      ('book', 'cancel', 'set_last_day', 'release', 'restore', 'undo', 'beach', 'season')),
    booking_id integer references booking (id) on delete restrict,
    detail jsonb not null default '{}',
    change jsonb,
    undoes_id integer references audit_log (id) on delete restrict,
    undone_by_id integer references audit_log (id) on delete restrict,
    check ((action = 'undo') = (undoes_id is not null)),
    check (change is null or booking_id is not null)
  )`.execute(db);
  await sql`create index audit_log_booking_id_idx on audit_log (booking_id)`.execute(db);
}

/** Drops the whole log: who did what is lost. Bookings themselves are untouched. */
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop table audit_log`.execute(db);
}
