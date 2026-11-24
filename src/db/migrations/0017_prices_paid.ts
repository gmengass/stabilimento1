import { sql, type Kysely } from "kysely";

// Prices and the "paid" tick (ADR 0029). One price row per season and number of days (1 to 31),
// plus the season row (days null). The suggested price is computed from it, never stored; the
// booking only keeps who ticked it paid, when, and the suggestion at that moment.

const ACTIONS_BEFORE = `'book', 'cancel', 'set_last_day', 'release', 'restore', 'undo', 'beach',
  'season', 'move', 'check_in', 'uncheck', 'hold', 'no_show'`;

async function setActions(db: Kysely<unknown>, actions: string): Promise<void> {
  await sql`alter table audit_log drop constraint audit_log_action_check`.execute(db);
  await sql`alter table audit_log add constraint audit_log_action_check
    check (action in (${sql.raw(actions)}))`.execute(db);
}

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`create table price (
    id integer generated always as identity primary key,
    season_id integer not null references season (id) on delete cascade,
    days smallint check (days between 1 and 31),
    single_cents integer not null check (single_cents between 0 and 100000000),
    bundle_cents integer not null check (bundle_cents between 0 and 100000000),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique nulls not distinct (season_id, days)
  )`.execute(db);
  await sql`create trigger price_set_updated_at before update on price
    for each row execute function set_updated_at()`.execute(db);
  // Open booking panels show the suggested price (ADR 0019).
  await sql`create trigger price_map_changed
    after insert or update or delete or truncate on price
    for each statement execute function notify_map_changed()`.execute(db);
  await sql`alter table booking
    add column paid_at timestamptz,
    add column paid_by text references "user" (id) on delete restrict,
    add column paid_suggested_cents integer check (paid_suggested_cents >= 0),
    add constraint booking_paid_check check ((paid_at is null) = (paid_by is null)),
    add constraint booking_paid_suggestion_check
      check (paid_at is not null or paid_suggested_cents is null)`.execute(db);
  await setActions(db, `${ACTIONS_BEFORE}, 'paid', 'unpaid'`);
}

/**
 * Drops the price lists and every paid tick. `paid` and `unpaid` entries can't be stored without
 * this migration, so they are deleted from the activity log, with the undos that point at them.
 */
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`create temporary table paid_entry on commit drop as
    with recursive chain (id) as (
      select id from audit_log where action in ('paid', 'unpaid')
      union
      select a.id from audit_log a join chain c on a.undoes_id = c.id
    ) select id from chain`.execute(db);
  await sql`update audit_log set undone_by_id = null
    where undone_by_id in (select id from paid_entry)`.execute(db);
  await sql`delete from audit_log where id in (select id from paid_entry)`.execute(db);
  await setActions(db, ACTIONS_BEFORE);
  await sql`alter table booking
    drop constraint booking_paid_suggestion_check,
    drop constraint booking_paid_check,
    drop column paid_suggested_cents,
    drop column paid_by,
    drop column paid_at`.execute(db);
  await sql`drop table price`.execute(db);
}
