import { isAPIError } from "better-auth/api";
import { sql, type Kysely } from "kysely";
import { z } from "zod";
import type { DB } from "@/db/types";
import type { Auth } from "./auth";
import { passwordSchema, placeholderEmail, roles, usernameSchema, type Role } from "./rules";
import type { CurrentUser } from "./session";

export type StaffError =
  "invalid" | "forbidden" | "usernameTaken" | "self" | "lastAdmin" | "notFound";

export type StaffResult = { ok: true } | { ok: false; error: StaffError };

export interface StaffRow {
  id: string;
  username: string;
  name: string;
  role: Role;
  banned: boolean;
}

const createSchema = z.object({
  username: usernameSchema,
  name: z.string().trim().min(1).max(100),
  password: passwordSchema,
  role: z.enum(roles).default("staff"),
});

const disableSchema = z.object({ userId: z.string().min(1), disabled: z.boolean() });

const resetSchema = z.object({ userId: z.string().min(1), password: passwordSchema });

const fail = (error: StaffError): StaffResult => ({ ok: false, error });

const USERNAME_TAKEN_CODES = new Set([
  "USERNAME_IS_ALREADY_TAKEN",
  "USER_ALREADY_EXISTS",
  "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
]);

const PG_UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === PG_UNIQUE_VIOLATION;
}

/** Maps Better Auth admin-endpoint errors to our result codes; anything else is rethrown. */
function toResult(error: unknown): StaffResult {
  // Two admins creating the same username at once: the loser hits the unique index.
  if (isUniqueViolation(error)) return fail("usernameTaken");
  if (!isAPIError(error)) throw error;
  const code = typeof error.body?.code === "string" ? error.body.code : "";
  if (USERNAME_TAKEN_CODES.has(code)) return fail("usernameTaken");
  if (error.status === "FORBIDDEN" || error.status === "UNAUTHORIZED") return fail("forbidden");
  if (error.status === "NOT_FOUND") return fail("notFound");
  throw error;
}

async function run(call: () => Promise<unknown>): Promise<StaffResult> {
  try {
    await call();
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}

export async function listUsers(db: Kysely<DB>): Promise<StaffRow[]> {
  const rows = await db
    .selectFrom("user")
    .select(["id", "username", "name", "role", "banned"])
    .orderBy("username")
    .execute();
  return rows.map((row) => ({ ...row, role: row.role === "admin" ? "admin" : "staff" }));
}

export async function createStaff(
  auth: Auth,
  headers: Headers,
  input: unknown,
): Promise<StaffResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const { username, name, password, role } = parsed.data;
  return run(() =>
    auth.api.createUser({
      headers,
      body: { email: placeholderEmail(username), password, name, role, data: { username } },
    }),
  );
}

// Serializes disables so two admins disabling each other can't leave no active admin.
const DISABLE_LOCK_KEY = 7_000_301;

async function hasOtherActiveAdmin(db: Kysely<DB>, userId: string): Promise<boolean> {
  const other = await db
    .selectFrom("user")
    .select("id")
    .where("role", "=", "admin")
    .where("banned", "=", false)
    .where("id", "!=", userId)
    .executeTakeFirst();
  return other !== undefined;
}

/** Disabling bans the user, which also ends all their sessions. */
export async function setDisabled(
  auth: Auth,
  db: Kysely<DB>,
  headers: Headers,
  actor: CurrentUser,
  input: unknown,
): Promise<StaffResult> {
  const parsed = disableSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const { userId, disabled } = parsed.data;
  if (actor.role !== "admin") return fail("forbidden");
  if (!disabled) return run(() => auth.api.unbanUser({ headers, body: { userId } }));
  if (userId === actor.id) return fail("self");
  // The ban commits on its own connection while the lock is held, so the next disable waits,
  // then sees it: its actor's session is gone, or no other active admin remains.
  return db.transaction().execute(async (trx) => {
    await sql`select pg_advisory_xact_lock(${DISABLE_LOCK_KEY})`.execute(trx);
    if (!(await hasOtherActiveAdmin(trx, userId))) return fail("lastAdmin");
    return run(() => auth.api.banUser({ headers, body: { userId } }));
  });
}

/** Sets a new password and ends the user's sessions, so a lost tablet is logged out. */
export async function resetPassword(
  auth: Auth,
  headers: Headers,
  input: unknown,
): Promise<StaffResult> {
  const parsed = resetSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const { userId, password } = parsed.data;
  // Revoke first: if setting the password then fails, the lost tablet is still logged out
  // and the admin simply retries.
  return run(async () => {
    await auth.api.revokeUserSessions({ headers, body: { userId } });
    await auth.api.setUserPassword({ headers, body: { userId, newPassword: password } });
  });
}
