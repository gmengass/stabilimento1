import { sql, type Kysely } from "kysely";

// Seasons and season passes (ADR 0004). A season belongs to the venue and covers every beach
// space. A season pass is a booking with kind = 'season' that points at its season; its released
// days are spot_day rows with state = 'released' (already in migration 0004).

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`create table season (
    id integer generated always as identity primary key,
    venue_id integer not null references venue (id) on delete restrict,
    name text not null check (name ~ '\\S'),
    start_date date not null,
    end_date date not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (end_date >= start_date),
    unique (venue_id, name)
  )`.execute(db);
  await sql`create trigger season_set_updated_at before update on season
    for each row execute function set_updated_at()`.execute(db);
  await sql`alter table booking
    add column season_id integer references season (id) on delete restrict`.execute(db);
  await sql`alter table booking add constraint booking_season_pass_has_season
    check ((kind = 'season') = (season_id is not null))`.execute(db);
  await sql`create index booking_season_id_idx on booking (season_id)`.execute(db);
}

/** Season passes stay as bookings of kind 'season'; only their link to the season is lost. */
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`alter table booking drop constraint booking_season_pass_has_season`.execute(db);
  await sql`alter table booking drop column season_id`.execute(db);
  await sql`drop table season`.execute(db);
}
