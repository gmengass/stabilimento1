import { sql, type Kysely } from "kysely";

// Setup changes (ADR 0030): a committed change to the beach layout, seasons or prices also sends
// one empty `setup_changed` notification, so open admin pages can tell a change from elsewhere
// apart from the bookings that `map_changed` reports all day. Not `user`: a language switch
// writes it.

const WATCHED = ["venue", "area", "area_line", "spot", "season", "price"];

const trigger = (table: string) => sql.raw(`"${table}_setup_changed"`);

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`create function notify_setup_changed() returns trigger language plpgsql as $$
    begin
      perform pg_notify('setup_changed', '');
      return null;
    end $$`.execute(db);
  for (const table of WATCHED) {
    await sql`create trigger ${trigger(table)}
      after insert or update or delete or truncate on ${sql.table(table)}
      for each statement execute function notify_setup_changed()`.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const table of WATCHED) {
    await sql`drop trigger if exists ${trigger(table)} on ${sql.table(table)}`.execute(db);
  }
  await sql`drop function if exists notify_setup_changed()`.execute(db);
}
