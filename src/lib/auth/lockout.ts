import { sql, type Kysely } from "kysely";
import type { DB } from "@/db/types";

/** Failed sign-ins for one username within the window that lock it. */
export const LOCKOUT_FAILURES = 10;
export const LOCKOUT_WINDOW_MS = 15 * 60_000;
/** Temporary only: a permanent lock would let anyone shut staff out during a rush. */
export const LOCKOUT_MS = 15 * 60_000;

/** Usernames are stored lower-case (`usernameSchema`); match what the sign-in will look up. */
export function normalizeUsername(username: unknown): string | null {
  if (typeof username !== "string") return null;
  const name = username.trim().toLowerCase();
  return name.length > 0 && name.length <= 100 ? name : null;
}

export async function lockedUntil(
  db: Kysely<DB>,
  username: string,
  now: Date = new Date(),
): Promise<Date | null> {
  const row = await db
    .selectFrom("login_failure")
    .select("locked_until")
    .where("username", "=", username)
    .where("locked_until", ">", now)
    .executeTakeFirst();
  return row?.locked_until ? new Date(row.locked_until) : null;
}

/**
 * Counts one failed sign-in, in one statement so simultaneous failures all count. A count
 * whose window has passed, or whose lock has ended, starts again at 1. Returns the lock's end
 * when this failure is the one that locks the username.
 */
export async function recordFailure(
  db: Kysely<DB>,
  username: string,
  now: Date = new Date(),
): Promise<Date | null> {
  const windowStart = new Date(now.getTime() - LOCKOUT_WINDOW_MS);
  const lockEnd = new Date(now.getTime() + LOCKOUT_MS);
  const restart = sql`(f.first_failed_at < ${windowStart} or f.locked_until <= ${now})`;
  const failures = sql`case when ${restart} then 1 else f.failures + 1 end`;
  const { rows } = await sql<{ failures: number }>`
    insert into login_failure as f (username, failures, first_failed_at)
    values (${username}, 1, ${now})
    on conflict (username) do update set
      failures = ${failures},
      first_failed_at = case when ${restart} then ${now} else f.first_failed_at end,
      locked_until = case
        when f.locked_until > ${now} then f.locked_until
        when ${failures} >= ${LOCKOUT_FAILURES} then ${lockEnd}
        else null end
    returning failures`.execute(db);
  await forgetOld(db, windowStart);
  // Upserts on one row run one after another, so exactly one failure reaches the threshold.
  return rows[0]?.failures === LOCKOUT_FAILURES ? lockEnd : null;
}

/** A successful sign-in, or an admin unlocking the account, starts the count again. */
export async function clearFailures(db: Kysely<DB>, username: string): Promise<void> {
  await db.deleteFrom("login_failure").where("username", "=", username).execute();
}

/** Usernames locked right now, for the staff page. */
export async function listLocked(
  db: Kysely<DB>,
  now: Date = new Date(),
): Promise<Map<string, Date>> {
  const rows = await db
    .selectFrom("login_failure")
    .select(["username", "locked_until"])
    .where("locked_until", ">", now)
    .execute();
  return new Map(rows.map((row) => [row.username, new Date(row.locked_until!)]));
}

// Typos from long ago are of no use; keeps the table small when someone tries many names.
async function forgetOld(db: Kysely<DB>, windowStart: Date): Promise<void> {
  await db
    .deleteFrom("login_failure")
    .where("first_failed_at", "<", windowStart)
    .where((eb) => eb.or([eb("locked_until", "is", null), eb("locked_until", "<", windowStart)]))
    .execute();
}
