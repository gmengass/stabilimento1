import { APIError } from "better-auth/api";
import type { Kysely } from "kysely";
import { z } from "zod";
import type { DB } from "@/db/types";
import type { Auth } from "./auth";
import { passwordSchema, placeholderEmail, roles, usernameSchema, type Role } from "./rules";
import type { CurrentUser } from "./session";

export type StaffError = "invalid" | "forbidden" | "usernameTaken" | "self" | "notFound";

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

const USERNAME_TAKEN_CODES = new Set(["USERNAME_IS_ALREADY_TAKEN", "USER_ALREADY_EXISTS"]);

/** Maps Better Auth admin-endpoint errors to our result codes; anything else is rethrown. */
function toResult(error: unknown): StaffResult {
  if (!(error instanceof APIError)) throw error;
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

/**
 * Disabling bans the user, which also ends all their sessions. Refusing self-disable is enough
 * to keep an admin: the actor is an active admin, so another one always remains.
 */
export async function setDisabled(
  auth: Auth,
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
  return run(() => auth.api.banUser({ headers, body: { userId } }));
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
  return run(async () => {
    await auth.api.setUserPassword({ headers, body: { userId, newPassword: password } });
    await auth.api.revokeUserSessions({ headers, body: { userId } });
  });
}
