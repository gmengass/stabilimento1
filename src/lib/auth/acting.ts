import { sql, type Kysely } from "kysely";
import type { DB } from "@/db/types";
import type { Viewer } from "@/lib/booking/audit";
import { ACTING_IDLE_MS } from "./rules";
import type { CurrentUser } from "./session";

export { ACTING_IDLE_MS };

export type ActorResult = { ok: true; actorId: string } | { ok: false; error: "needsActor" };

export type ChooseActingResult = { ok: true } | { ok: false; error: "invalid" };

export interface ActingChoice {
  id: string;
  name: string;
}

/**
 * Who a state-changing action is recorded under. A normal account acts as itself. A communal
 * account acts as the staff member chosen on its session, and only while that selection is fresh.
 * Checking and refreshing the idle time is one statement, so simultaneous actions can't race.
 */
export async function resolveActor(
  db: Kysely<DB>,
  user: Pick<CurrentUser, "id" | "communal" | "sessionId">,
  now: Date = new Date(),
): Promise<ActorResult> {
  if (!user.communal) return { ok: true, actorId: user.id };
  const oldest = new Date(now.getTime() - ACTING_IDLE_MS);
  const { rows } = await sql<{ staffUserId: string }>`
    update acting_staff a set last_used_at = ${now}
    from "user" u
    where a.session_id = ${user.sessionId} and u.id = a.staff_user_id and not u.banned
      and u.role = 'staff' and not u.communal
      and a.last_used_at >= ${oldest}
    returning a.staff_user_id as "staffUserId"`.execute(db);
  const row = rows[0];
  return row ? { ok: true, actorId: row.staffUserId } : { ok: false, error: "needsActor" };
}

/** Active staff accounts a tablet can act as: no admins, no other communal accounts. */
export function listActingChoices(db: Kysely<DB>): Promise<ActingChoice[]> {
  return db
    .selectFrom("user")
    .select(["id", "name"])
    .where("role", "=", "staff")
    .where("banned", "=", false)
    .where("communal", "=", false)
    .orderBy("name")
    .orderBy("id")
    .execute();
}

/** Sets who acts on this session, replacing any earlier choice. Only `listActingChoices` people. */
export async function chooseActing(
  db: Kysely<DB>,
  sessionId: string,
  staffUserId: string,
  now: Date = new Date(),
): Promise<ChooseActingResult> {
  const { rows } = await sql`
    insert into acting_staff (session_id, staff_user_id, last_used_at)
    select ${sessionId}, id, ${now} from "user"
    where id = ${staffUserId} and role = 'staff' and not banned and not communal
    on conflict (session_id) do update
      set staff_user_id = excluded.staff_user_id, last_used_at = excluded.last_used_at
    returning session_id`.execute(db);
  return rows.length > 0 ? { ok: true } : { ok: false, error: "invalid" };
}

export async function clearActing(db: Kysely<DB>, sessionId: string): Promise<void> {
  await db.deleteFrom("acting_staff").where("session_id", "=", sessionId).execute();
}

/** Who is acting now, for the label: like `resolveActor` but changes nothing. */
export async function currentActing(
  db: Kysely<DB>,
  user: Pick<CurrentUser, "communal" | "sessionId">,
  now: Date = new Date(),
): Promise<ActingChoice | null> {
  if (!user.communal) return null;
  const oldest = new Date(now.getTime() - ACTING_IDLE_MS);
  const row = await db
    .selectFrom("acting_staff as a")
    .innerJoin("user as u", "u.id", "a.staff_user_id")
    .select(["u.id", "u.name"])
    .where("a.session_id", "=", user.sessionId)
    .where("u.banned", "=", false)
    .where("a.last_used_at", ">=", oldest)
    .executeTakeFirst();
  return row ?? null;
}

/**
 * Who the activity panel shows Undo for: a normal account itself, a communal tablet the person
 * currently acting (as staff), and no one when nobody is (ADR 0025).
 */
export function viewerFor(
  user: Pick<CurrentUser, "id" | "role" | "communal">,
  acting: ActingChoice | null,
): Viewer | null {
  if (!user.communal) return { id: user.id, role: user.role };
  return acting ? { id: acting.id, role: "staff" } : null;
}
