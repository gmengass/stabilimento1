import { sql, type Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, getDb } from "@/db/client";
import { runMigrations } from "@/db/migrator";
import type { DB } from "@/db/types";
import type { Auth } from "@/lib/auth/auth";
import {
  addUser,
  post,
  sessionCookie,
  sessionCount,
  sessionHeaders,
  signIn,
  testAuth,
  truncateAuth,
  uniqueIp,
  userCount,
} from "./auth-fixtures";
import { testDatabaseUrl } from "./test-database";

const PASSWORD = "correct-horse-1";

let db: Kysely<DB>;
let auth: Auth;
let migrated = false;
let annaId: string;

beforeAll(async () => {
  db = createDb(testDatabaseUrl());
  const result = await runMigrations(db, "up");
  if (result.error) throw result.error;
  migrated = true;
  auth = testAuth(db);
});

beforeEach(async () => {
  if (!migrated) throw new Error("migrations did not run; refusing to truncate");
  await truncateAuth(db);
  annaId = await addUser(auth, { username: "anna", password: PASSWORD });
});

afterAll(async () => {
  await db.destroy();
  await getDb().destroy();
});

describe("locked endpoints", () => {
  it("POST /sign-up/email is 404 and creates no user", async () => {
    await truncateAuth(db);
    const response = await post(auth, "/sign-up/email", {
      email: "mallory@example.com",
      password: "long-enough-password",
      name: "Mallory",
      username: "mallory",
    });
    expect(response.status).toBe(404);
    expect(await userCount(db)).toBe(0);
  });

  it("POST /sign-in/email is 404 and creates no session", async () => {
    const response = await post(auth, "/sign-in/email", {
      email: "anna@staff.invalid",
      password: PASSWORD,
    });
    expect(response.status).toBe(404);
    expect(await sessionCount(db)).toBe(0);
  });

  it("POST /admin/create-user is 404 even with an admin session", async () => {
    await addUser(auth, { username: "boss", password: PASSWORD, role: "admin" });
    const adminHeaders = sessionHeaders(await signIn(auth, "boss", PASSWORD));
    const before = await userCount(db);
    const response = await post(
      auth,
      "/admin/create-user",
      { email: "x@staff.invalid", password: PASSWORD, name: "X", data: { username: "xavier" } },
      { headers: adminHeaders },
    );
    expect(response.status).toBe(404);
    expect(await userCount(db)).toBe(before);
  });

  it.each(["/admin/ban-user", "/admin/set-user-password", "/admin/list-users"])(
    "POST %s is 404 for an admin session",
    async (path) => {
      await addUser(auth, { username: "boss", password: PASSWORD, role: "admin" });
      const adminHeaders = sessionHeaders(await signIn(auth, "boss", PASSWORD));
      const response = await post(auth, path, { userId: annaId }, { headers: adminHeaders });
      expect(response.status).toBe(404);
    },
  );

  it("POST /is-username-available is 404", async () => {
    const response = await post(auth, "/is-username-available", { username: "anna" });
    expect(response.status).toBe(404);
  });
});

describe("sign-in", () => {
  it("creates a session and sets an httpOnly, SameSite=Lax cookie", async () => {
    const response = await signIn(auth, "anna", PASSWORD);
    expect(response.status).toBe(200);
    const cookie = sessionCookie(response);
    expect(cookie).toMatch(/;\s*HttpOnly/i);
    expect(cookie).toMatch(/;\s*SameSite=Lax/i);
    expect(cookie).not.toMatch(/;\s*Secure/i);
    expect(await sessionCount(db, annaId)).toBe(1);
  });

  it("uses a Secure, __Secure- prefixed cookie on an https base URL", async () => {
    const httpsUrl = "https://lido.example";
    const secureAuth = testAuth(db, httpsUrl);
    const response = await signIn(secureAuth, "anna", PASSWORD, { baseURL: httpsUrl });
    expect(response.status).toBe(200);
    const cookie = sessionCookie(response);
    expect(cookie).toMatch(/^__Secure-better-auth\.session_token=/);
    expect(cookie).toMatch(/;\s*Secure/i);
  });

  it("matches the username case-insensitively", async () => {
    const response = await signIn(auth, "ANNA", PASSWORD);
    expect(response.status).toBe(200);
  });

  it("returns the same 401 body for a wrong password and an unknown user", async () => {
    const wrong = await signIn(auth, "anna", "wrong-password-1");
    const unknown = await signIn(auth, "nobody", PASSWORD);
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    const wrongBody = await wrong.json();
    expect(wrongBody).toMatchObject({ code: "INVALID_USERNAME_OR_PASSWORD" });
    expect(await unknown.json()).toEqual(wrongBody);
    expect(await sessionCount(db)).toBe(0);
  });

  it("refuses a banned user with the right password and creates no session", async () => {
    await sql`update "user" set banned = true where id = ${annaId}`.execute(db);
    const response = await signIn(auth, "anna", PASSWORD);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "BANNED_USER" });
    expect(await sessionCount(db)).toBe(0);
  });
});

describe("rate limit", () => {
  it("returns 429 on the 6th attempt from one IP within 60 s", async () => {
    const ip = uniqueIp();
    for (let attempt = 1; attempt <= 5; attempt++) {
      const response = await signIn(auth, "anna", "wrong-password-1", { ip });
      expect(response.status, `attempt ${attempt}`).toBe(401);
    }
    const sixth = await signIn(auth, "anna", PASSWORD, { ip });
    expect(sixth.status).toBe(429);
    expect(await sessionCount(db)).toBe(0);
  });

  it("does not limit a different IP", async () => {
    const ip = uniqueIp();
    for (let attempt = 1; attempt <= 6; attempt++) {
      await signIn(auth, "anna", "wrong-password-1", { ip });
    }
    const other = await signIn(auth, "anna", PASSWORD);
    expect(other.status).toBe(200);
  });
});

describe("sign-out", () => {
  it("deletes the session row", async () => {
    const signedIn = await signIn(auth, "anna", PASSWORD);
    expect(await sessionCount(db, annaId)).toBe(1);
    const response = await post(auth, "/sign-out", {}, { headers: sessionHeaders(signedIn) });
    expect(response.status).toBe(200);
    expect(await sessionCount(db, annaId)).toBe(0);
  });
});
