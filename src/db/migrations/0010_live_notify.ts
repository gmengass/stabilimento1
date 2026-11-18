import { sql, type Kysely } from "kysely";

// Live map (ADR 0019): every committed change to what the map shows sends one empty
// `map_changed` notification. Postgres delivers it on commit only and folds duplicates within
// a transaction, so a rollback sends nothing and a multi-row change sends one.

const WATCHED = [
  "venue",
  "area",
  "area_line",
  "spot",
  "season",
  "booking",
  "booking_spot",
  "spot_day",
  "check_in",
  "audit_log",
];

const trigger = (table: string) => sql.raw(`"${table}_map_changed"`);

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`create function notify_map_changed() returns trigger language plpgsql as $$
    begin
      perform pg_notify('map_changed', '');
      return null;
    end $$`.execute(db);
  for (const table of WATCHED) {
    await sql`create trigger ${trigger(table)}
      after insert or update or delete or truncate on ${sql.table(table)}
      for each statement execute function notify_map_changed()`.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const table of WATCHED) {
    await sql`drop trigger if exists ${trigger(table)} on ${sql.table(table)}`.execute(db);
  }
  await sql`drop function if exists notify_map_changed()`.execute(db);
}
