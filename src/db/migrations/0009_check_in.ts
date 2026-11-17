import { sql, type Kysely } from "kysely";

// Check-in and the hold rule (ADR 0015). One check_in row per booking per day; the venue's
// default hold time; audit entries for check-ins, hold changes and automatic no-shows, which
// have no user.

const ACTIONS_BEFORE = `'book', 'cancel', 'set_last_day', 'release', 'restore', 'undo', 'beach',
  'season', 'move'`;

async function setActions(db: Kysely<unknown>, actions: string): Promise<void> {
  await sql`alter table audit_log drop constraint audit_log_action_check`.execute(db);
  await sql`alter table audit_log add constraint audit_log_action_check
    check (action in (${sql.raw(actions)}))`.execute(db);
}

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`create table check_in (
    booking_id integer not null references booking (id) on delete restrict,
    date date not null,
    checked_in_at timestamptz not null default now(),
    checked_in_by text not null references "user" (id) on delete restrict,
    primary key (booking_id, date)
  )`.execute(db);
  await sql`create index check_in_date_idx on check_in (date)`.execute(db);
  await sql`alter table venue add column default_hold_until time not null default '11:00'`.execute(
    db,
  );
  await setActions(db, `${ACTIONS_BEFORE}, 'check_in', 'uncheck', 'hold', 'no_show'`);
  await sql`alter table audit_log alter column user_id drop not null`.execute(db);
  await sql`alter table audit_log add constraint audit_log_user_check
    check (user_id is not null or action = 'no_show')`.execute(db);
}

/**
 * Refuses once anyone was checked in, flagged or given a hold: those records can't be stored
 * without this migration. Restore the backup taken before the update instead.
 */
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`do $$ begin
    if exists (select 1 from check_in)
      or exists (select 1 from spot_day where state = 'no_show')
      or exists (select 1 from audit_log
        where action in ('check_in', 'uncheck', 'hold', 'no_show')) then
      raise exception 'check-ins or no-shows exist: restore the backup taken before the update';
    end if;
  end $$`.execute(db);
  await sql`alter table audit_log drop constraint audit_log_user_check`.execute(db);
  await sql`alter table audit_log alter column user_id set not null`.execute(db);
  await setActions(db, ACTIONS_BEFORE);
  await sql`alter table venue drop column default_hold_until`.execute(db);
  await sql`drop table check_in`.execute(db);
}
