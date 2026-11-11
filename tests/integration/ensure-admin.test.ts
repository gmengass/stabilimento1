import type { Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, getDb } from "@/db/client";
import { ensureAdmin } from "@/db/ensure-admin";
import { runMigrations } from "@/db/migrator";
import type { DB } from "@/db/types";
import type { Auth } from "@/lib/auth/auth";
import { placeholderEmail } from "@/lib/auth/rules";
import { addUser, signIn, testAuth, truncateAuth, userCount } from "./auth-fixtures";
import { testDatabaseUrl } from "./test-database";

const FIRST_PASSWORD = "first-password-1";

let db: Kysely<DB>;
let auth: Auth;
let migrated = false;

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
});

afterAll(async () => {
  await db.destroy();
  await getDb().destroy();
});

describe("ensureAdmin", () => {
  it("creates an admin with a placeholder email who can sign in", async () => {
    await expect(
      ensureAdmin(auth, db, { username: "boss", password: FIRST_PASSWORD }),
    ).resolves.toBe("created");

    const rows = await db.selectFrom("user").select(["username", "role", "email"]).execute();
    expect(rows).toEqual([{ username: "boss", role: "admin", email: placeholderEmail("boss") }]);
    expect((await signIn(auth, "boss", FIRST_PASSWORD)).status).toBe(200);
  });

  it("stores the username lowercased", async () => {
    await ensureAdmin(auth, db, { username: "Boss", password: FIRST_PASSWORD });
    const row = await db.selectFrom("user").select("username").executeTakeFirstOrThrow();
    expect(row.username).toBe("boss");
  });

  it("is a no-op on a second run and keeps the first password", async () => {
    await ensureAdmin(auth, db, { username: "boss", password: FIRST_PASSWORD });
    await expect(
      ensureAdmin(auth, db, { username: "boss", password: "second-password-2" }),
    ).resolves.toBe("exists");

    expect(await userCount(db)).toBe(1);
    expect((await signIn(auth, "boss", FIRST_PASSWORD)).status).toBe(200);
    expect((await signIn(auth, "boss", "second-password-2")).status).toBe(401);
  });

  it("leaves an existing staff user with that username untouched", async () => {
    await addUser(auth, { username: "boss", password: FIRST_PASSWORD, role: "staff" });
    await expect(
      ensureAdmin(auth, db, { username: "boss", password: "second-password-2" }),
    ).resolves.toBe("exists");
    const row = await db.selectFrom("user").select("role").executeTakeFirstOrThrow();
    expect(row.role).toBe("staff");
  });

  it.each([
    [{ password: FIRST_PASSWORD }, /ADMIN_USERNAME/],
    [{ username: "", password: FIRST_PASSWORD }, /ADMIN_USERNAME/],
    [{ username: "bad name!", password: FIRST_PASSWORD }, /ADMIN_USERNAME/],
    [{ username: "boss" }, /ADMIN_PASSWORD/],
    [{ username: "boss", password: "nine-char" }, /ADMIN_PASSWORD/],
    [{ username: "boss", password: "x".repeat(129) }, /ADMIN_PASSWORD/],
  ])("refuses %j and creates nothing", async (input, message) => {
    await expect(ensureAdmin(auth, db, input)).rejects.toThrow(message);
    expect(await userCount(db)).toBe(0);
  });
});
