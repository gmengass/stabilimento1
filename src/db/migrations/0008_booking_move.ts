import { sql, type Kysely } from "kysely";

// Moving a booking (docs/plans/move-booking.md). A moved booking keeps its old umbrellas'
// booking_spot rows, because days already used still point at them, but they are no longer
// `current`: the booking's umbrellas are its current rows. The audit log gains a `move` action.

const ACTIONS_BEFORE = `'book', 'cancel', 'set_last_day', 'release', 'restore', 'undo', 'beach',
  'season'`;

async function setActions(db: Kysely<unknown>, actions: string): Promise<void> {
  await sql`alter table audit_log drop constraint audit_log_action_check`.execute(db);
  await sql`alter table audit_log add constraint audit_log_action_check
    check (action in (${sql.raw(actions)}))`.execute(db);
}

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table booking_spot add column current boolean not null default true`.execute(db);
  await setActions(db, `${ACTIONS_BEFORE}, 'move'`);
}

/**
 * Refuses once any booking was moved: dropping `current` would show old and new umbrellas as one
 * booking, and `move` entries can't be stored. Restore the backup taken before the update instead.
 */
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`do $$ begin
    if exists (select 1 from audit_log where action = 'move')
      or exists (select 1 from booking_spot where not current) then
      raise exception 'bookings were moved: restore the backup taken before the update';
    end if;
  end $$`.execute(db);
  await setActions(db, ACTIONS_BEFORE);
  await sql`alter table booking_spot drop column current`.execute(db);
}
