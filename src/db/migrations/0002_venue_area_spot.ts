import { sql, type Kysely, type RawBuilder } from "kysely";

// Beach layout (ADR 0004, docs/plans/db-schema.md): venue > area > line > spot.
// No ON DELETE CASCADE anywhere: later booking tables must never lose history silently.

const SLUG = "^[a-z0-9]+(-[a-z0-9]+)*$";

const TABLES = ["venue", "area", "area_line", "spot"] as const;

const upStatements: RawBuilder<unknown>[] = [
  sql`create function set_updated_at() returns trigger language plpgsql as $$
    begin
      new.updated_at := now();
      return new;
    end
  $$`,
  sql`create type spot_kind as enum ('umbrella', 'sunbed')`,
  sql`create table venue (
    id integer generated always as identity primary key,
    name text not null check (btrim(name) <> ''),
    slug text not null unique check (slug ~ ${sql.lit(SLUG)}),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  sql`create table area (
    id integer generated always as identity primary key,
    venue_id integer not null references venue (id) on delete restrict,
    name text not null check (btrim(name) <> ''),
    slug text not null check (slug ~ ${sql.lit(SLUG)}),
    sort_order integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (venue_id, slug)
  )`,
  sql`create table area_line (
    id integer generated always as identity primary key,
    area_id integer not null references area (id) on delete restrict,
    number integer not null check (number >= 1),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (area_id, number),
    unique (id, area_id)
  )`,
  sql`create table spot (
    id integer generated always as identity primary key,
    area_id integer not null,
    line_id integer not null,
    number integer not null check (number >= 1),
    position integer not null check (position >= 1),
    kind spot_kind not null default 'umbrella',
    included_sunbeds smallint not null default 2,
    max_sunbeds smallint not null default 3,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    foreign key (line_id, area_id) references area_line (id, area_id) on delete restrict,
    unique (area_id, number),
    unique (line_id, position),
    check (max_sunbeds >= 1 and included_sunbeds between 0 and max_sunbeds),
    check (kind <> 'sunbed' or (included_sunbeds = 1 and max_sunbeds = 1))
  )`,
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
  await sql`drop type spot_kind`.execute(db);
  await sql`drop function set_updated_at()`.execute(db);
}
