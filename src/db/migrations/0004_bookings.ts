import { sql, type Kysely, type RawBuilder } from "kysely";

// Bookings and per-day occupancy (ADR 0004). One spot_day row per spot per day; the partial
// unique index makes a second `booked` row for the same spot and day impossible.

const TABLES = ["booking", "booking_spot", "spot_day"] as const;

const upStatements: RawBuilder<unknown>[] = [
  sql`create type booking_kind as enum ('day', 'multi_day', 'season')`,
  sql`create type booking_status as enum ('active', 'cancelled')`,
  sql`create type spot_day_state as enum ('booked', 'released', 'no_show')`,
  sql`create table booking (
    id integer generated always as identity primary key,
    kind booking_kind not null,
    status booking_status not null default 'active',
    customer_name text not null check (customer_name ~ '\\S'),
    customer_phone text not null check (customer_phone ~ '\\d'),
    start_date date not null,
    end_date date not null,
    notes text not null default '',
    hold_until time,
    created_by text not null references "user" (id) on delete restrict,
    cancelled_at timestamptz,
    cancelled_by text references "user" (id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (end_date >= start_date),
    check (kind <> 'day' or start_date = end_date),
    check (kind <> 'multi_day' or end_date > start_date),
    check ((status = 'cancelled') = (cancelled_at is not null))
  )`,
  sql`create index booking_customer_name_idx on booking (lower(customer_name))`,
  sql`create table booking_spot (
    id integer generated always as identity primary key,
    booking_id integer not null references booking (id) on delete restrict,
    spot_id integer not null references spot (id) on delete restrict,
    sunbeds smallint not null check (sunbeds >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (booking_id, spot_id),
    unique (id, spot_id)
  )`,
  sql`create index booking_spot_spot_id_idx on booking_spot (spot_id)`,
  sql`create table spot_day (
    id integer generated always as identity primary key,
    spot_id integer not null,
    booking_spot_id integer not null,
    date date not null,
    state spot_day_state not null default 'booked',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    foreign key (booking_spot_id, spot_id) references booking_spot (id, spot_id)
      on delete restrict,
    unique (booking_spot_id, date)
  )`,
  sql`create unique index spot_day_booked_once on spot_day (spot_id, date)
    where state = 'booked'`,
  sql`create index spot_day_date_idx on spot_day (date)`,
  sql`create index spot_day_spot_id_idx on spot_day (spot_id)`,
  ...TABLES.map(
    (table) =>
      sql`create trigger ${sql.raw(`${table}_set_updated_at`)} before update on ${sql.table(table)}
        for each row execute function set_updated_at()`,
  ),
];

export async function up(db: Kysely<unknown>): Promise<void> {
  for (const statement of upStatements) await statement.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const table of [...TABLES].reverse()) await sql`drop table ${sql.table(table)}`.execute(db);
  await sql`drop type spot_day_state`.execute(db);
  await sql`drop type booking_status`.execute(db);
  await sql`drop type booking_kind`.execute(db);
}
