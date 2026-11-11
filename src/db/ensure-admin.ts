import type { Kysely } from "kysely";
import { z } from "zod";
import type { Auth } from "@/lib/auth/auth";
import { passwordSchema, placeholderEmail, usernameSchema } from "@/lib/auth/rules";
import type { DB } from "./types";

const inputSchema = z.object({ username: usernameSchema, password: passwordSchema });

export interface AdminInput {
  username?: string;
  password?: string;
}

function parseInput(input: AdminInput): z.infer<typeof inputSchema> {
  const result = inputSchema.safeParse(input);
  if (result.success) return result.data;
  const fields = result.error.issues.map((i) => `ADMIN_${String(i.path[0]).toUpperCase()}`);
  throw new Error(`Invalid or missing ${[...new Set(fields)].join(", ")}: see .env.example`);
}

export type EnsureAdminOutcome = "created" | "exists" | "takenByStaff";

/** Creates the first admin unless the username is taken. Never changes an existing account. */
export async function ensureAdmin(
  auth: Auth,
  db: Kysely<DB>,
  input: AdminInput,
): Promise<EnsureAdminOutcome> {
  const { username, password } = parseInput(input);
  const existing = await db
    .selectFrom("user")
    .select("role")
    .where("username", "=", username)
    .executeTakeFirst();
  if (existing) return existing.role === "admin" ? "exists" : "takenByStaff";

  await auth.api.createUser({
    body: {
      email: placeholderEmail(username),
      password,
      name: username,
      role: "admin",
      data: { username },
    },
  });
  return "created";
}
