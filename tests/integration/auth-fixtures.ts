import { sql, type Kysely } from "kysely";
import { createAuth, type Auth } from "@/lib/auth/auth";
import type { CurrentUser } from "@/lib/auth/session";
import type { Role } from "@/lib/auth/rules";
import type { DB } from "@/db/types";

export const BASE_URL = "http://localhost:3000";
const TEST_SECRET = "test-secret-not-for-production-0123456789";

export function testAuth(db: Kysely<DB>, baseURL = BASE_URL, trustedOrigins?: string[]): Auth {
  return createAuth({ db, secret: TEST_SECRET, baseURL, trustedOrigins });
}

export async function truncateAuth(db: Kysely<DB>): Promise<void> {
  await sql`truncate "user", session, account, verification cascade`.execute(db);
}

let ipCounter = 0;

/** A fresh client IP per call, so the per-IP sign-in rate limit never leaks between tests. */
export function uniqueIp(): string {
  ipCounter += 1;
  return `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
}

interface PostOptions {
  ip?: string;
  headers?: Headers;
  baseURL?: string;
  origin?: string;
}

export function post(
  auth: Auth,
  path: string,
  body: unknown,
  { ip = uniqueIp(), headers, baseURL = BASE_URL, origin = baseURL }: PostOptions = {},
): Promise<Response> {
  const merged = new Headers(headers);
  merged.set("content-type", "application/json");
  merged.set("origin", origin);
  // Caddy overwrites this header with the peer address (ADR 0008).
  merged.set("x-real-ip", ip);
  return auth.handler(
    new Request(`${baseURL}/api/auth${path}`, {
      method: "POST",
      headers: merged,
      body: JSON.stringify(body),
    }),
  );
}

export function signIn(
  auth: Auth,
  username: string,
  password: string,
  options?: PostOptions,
): Promise<Response> {
  return post(auth, "/sign-in/username", { username, password }, options);
}

export function sessionCookie(response: Response): string {
  const cookie = response.headers
    .getSetCookie()
    .find((c) => /^(__Secure-)?better-auth\.session_token=/.test(c));
  if (!cookie) throw new Error(`no session cookie (status ${response.status})`);
  return cookie;
}

/** Request headers carrying the session from a successful sign-in response. */
export function sessionHeaders(response: Response): Headers {
  const pair = sessionCookie(response).split(";")[0] ?? "";
  return new Headers({ cookie: pair });
}

export interface NewUser {
  username: string;
  password: string;
  role?: Role;
  name?: string;
}

export async function addUser(auth: Auth, user: NewUser): Promise<string> {
  const created = await auth.api.createUser({
    body: {
      email: `${user.username}@staff.invalid`,
      password: user.password,
      name: user.name ?? user.username,
      role: user.role ?? "staff",
      data: { username: user.username },
    },
  });
  return created.user.id;
}

/** Creates a user, signs in and returns what an action receives for that actor. */
export async function loggedIn(
  auth: Auth,
  user: NewUser,
): Promise<{ actor: CurrentUser; headers: Headers }> {
  const id = await addUser(auth, user);
  const response = await signIn(auth, user.username, user.password);
  if (response.status !== 200) throw new Error(`sign-in failed: ${response.status}`);
  return {
    actor: {
      id,
      username: user.username,
      name: user.name ?? user.username,
      role: user.role ?? "staff",
      locale: "it",
    },
    headers: sessionHeaders(response),
  };
}

export async function sessionCount(db: Kysely<DB>, userId?: string): Promise<number> {
  let query = db.selectFrom("session").select((eb) => eb.fn.countAll<string>().as("n"));
  if (userId !== undefined) query = query.where("user_id", "=", userId);
  const row = await query.executeTakeFirstOrThrow();
  return Number(row.n);
}

export async function userCount(db: Kysely<DB>): Promise<number> {
  const row = await db
    .selectFrom("user")
    .select((eb) => eb.fn.countAll<string>().as("n"))
    .executeTakeFirstOrThrow();
  return Number(row.n);
}
