import { createHash } from "node:crypto";
import { sql, type Kysely } from "kysely";
import type { DB } from "@/db/types";
import { USERNAME_MAX } from "./rules";

export interface LockoutRule {
  /** Failed sign-ins within the window that lock the key. */
  failures: number;
}

/**
 * Wrong passwords for one username from one address: 10 lock that pair, so a guesser is stopped
 * while the real user, on another device, can still sign in.
 */
export const FROM_ADDRESS: LockoutRule = { failures: 10 };
/**
 * Wrong passwords for one username from anywhere: a guesser spread over many addresses. High
 * enough that one device (5 tries a minute) can't keep a colleague or the admin locked out.
 */
export const FROM_ANYWHERE: LockoutRule = { failures: 100 };

export const LOCKOUT_WINDOW_MS = 15 * 60_000;
/** Temporary only: a permanent lock would let anyone shut staff out during a rush. */
export const LOCKOUT_MS = 15 * 60_000;

// Usernames are [a-z0-9_.] (Better Auth's validator), so "@" never appears in one.
const SEPARATOR = "@";

/** Usernames are stored lower-case (`usernameSchema`); match what the sign-in will look up. */
export function normalizeUsername(username: unknown): string | null {
  if (typeof username !== "string") return null;
  const name = username.trim().toLowerCase();
  return name.length > 0 && name.length <= USERNAME_MAX ? name : null;
}

/** The keys one sign-in attempt counts against, with the rule for each. */
export function lockoutKeys(username: string, ip: string | null): [string, LockoutRule][] {
  return [
    [username, FROM_ANYWHERE],
    [`${username}${SEPARATOR}${ip ?? "unknown"}`, FROM_ADDRESS],
  ];
}

/** For logs: a typed username is often a password typed in the wrong field. */
export function logName(username: string): string {
  return createHash("sha256").update(username).digest("hex").slice(0, 12);
}

export async function lockedUntil(
  db: Kysely<DB>,
  keys: string[],
  now: Date = new Date(),
): Promise<Date | null> {
  const row = await db
    .selectFrom("login_failure")
    .select("locked_until")
    .where("key", "in", keys)
    .where("locked_until", ">", now)
    .orderBy("locked_until", "desc")
    .executeTakeFirst();
  return row?.locked_until ? new Date(row.locked_until) : null;
}

/**
 * Counts one failed sign-in, in one statement so simultaneous failures all count. A count
 * whose window has passed, or whose lock has ended, starts again at 1. Returns the lock's end
 * when this failure is the one that locks the key.
 */
export async function recordFailure(
  db: Kysely<DB>,
  key: string,
  rule: LockoutRule,
  now: Date = new Date(),
): Promise<Date | null> {
  const windowStart = new Date(now.getTime() - LOCKOUT_WINDOW_MS);
  const lockEnd = new Date(now.getTime() + LOCKOUT_MS);
  const restart = sql`(f.first_failed_at < ${windowStart} or f.locked_until <= ${now})`;
  const failures = sql`case when ${restart} then 1 else f.failures + 1 end`;
  const { rows } = await sql<{ failures: number }>`
    insert into login_failure as f (key, failures, first_failed_at)
    values (${key}, 1, ${now})
    on conflict (key) do update set
      failures = ${failures},
      first_failed_at = case when ${restart} then ${now} else f.first_failed_at end,
      locked_until = case
        when f.locked_until > ${now} then f.locked_until
        when ${failures} >= ${rule.failures} then ${lockEnd}
        else null end
    returning failures`.execute(db);
  // Upserts on one row run one after another, so exactly one failure reaches the threshold.
  return rows[0]?.failures === rule.failures ? lockEnd : null;
}

/** Typos from long ago are of no use; keeps the table small when someone tries many names. */
export async function forgetOld(db: Kysely<DB>, now: Date = new Date()): Promise<void> {
  const windowStart = new Date(now.getTime() - LOCKOUT_WINDOW_MS);
  await db
    .deleteFrom("login_failure")
    .where("first_failed_at", "<", windowStart)
    .where((eb) => eb.or([eb("locked_until", "is", null), eb("locked_until", "<", now)]))
    .execute();
}

/** A correct sign-in, a new password or an admin unlocking: every count for the username. */
export async function clearFailures(db: Kysely<DB>, username: string): Promise<void> {
  await db
    .deleteFrom("login_failure")
    .where((eb) =>
      eb.or([eb("key", "=", username), eb("key", "like", `${likeEscape(username)}${SEPARATOR}%`)]),
    )
    .execute();
}

/** Usernames with a lock on now (from anywhere or from one address), for the staff page. */
export async function listLocked(
  db: Kysely<DB>,
  now: Date = new Date(),
): Promise<Map<string, Date>> {
  const rows = await db
    .selectFrom("login_failure")
    .select(["key", "locked_until"])
    .where("locked_until", ">", now)
    .execute();
  const locked = new Map<string, Date>();
  for (const row of rows) {
    const username = row.key.split(SEPARATOR)[0]!;
    const until = new Date(row.locked_until!);
    if (until > (locked.get(username) ?? new Date(0))) locked.set(username, until);
  }
  return locked;
}

function likeEscape(text: string): string {
  return text.replace(/[\\%_]/g, "\\$&");
}
