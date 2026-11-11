import type { Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, getDb } from "@/db/client";
import { runMigrations } from "@/db/migrator";
import type { DB } from "@/db/types";
import type { Auth } from "@/lib/auth/auth";
import { placeholderEmail } from "@/lib/auth/rules";
import type { CurrentUser } from "@/lib/auth/session";
import { createStaff, listUsers, resetPassword, setDisabled } from "@/lib/auth/staff";
import {
  addUser,
  loggedIn,
  sessionCount,
  signIn,
  testAuth,
  truncateAuth,
  userCount,
} from "./auth-fixtures";
import { testDatabaseUrl } from "./test-database";

const ADMIN_PASSWORD = "admin-password-1";
const STAFF_PASSWORD = "staff-password-1";
const NEW_PASSWORD = "brand-new-password";

let db: Kysely<DB>;
let auth: Auth;
let migrated = false;

let admin: { actor: CurrentUser; headers: Headers };
let staff: { actor: CurrentUser; headers: Headers };

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
  admin = await loggedIn(auth, { username: "boss", password: ADMIN_PASSWORD, role: "admin" });
  staff = await loggedIn(auth, { username: "anna", password: STAFF_PASSWORD, name: "Anna" });
});

afterAll(async () => {
  await db.destroy();
  await getDb().destroy();
});

async function userRow(username: string) {
  return db
    .selectFrom("user")
    .select(["id", "username", "name", "role", "banned", "email"])
    .where("username", "=", username)
    .executeTakeFirst();
}

async function isBanned(userId: string): Promise<boolean> {
  const row = await db
    .selectFrom("user")
    .select("banned")
    .where("id", "=", userId)
    .executeTakeFirstOrThrow();
  return row.banned;
}

const newStaff = { username: "mario", name: "Mario", password: STAFF_PASSWORD };

describe("listUsers", () => {
  it("lists every user ordered by username", async () => {
    await addUser(auth, { username: "zeno", password: STAFF_PASSWORD, name: "Zeno" });
    expect(await listUsers(db)).toEqual([
      { id: staff.actor.id, username: "anna", name: "Anna", role: "staff", banned: false },
      { id: admin.actor.id, username: "boss", name: "boss", role: "admin", banned: false },
      { id: expect.any(String), username: "zeno", name: "Zeno", role: "staff", banned: false },
    ]);
  });
});

describe("createStaff", () => {
  it("creates a staff user by default who can sign in", async () => {
    await expect(createStaff(auth, admin.headers, newStaff)).resolves.toEqual({ ok: true });
    expect(await userRow("mario")).toMatchObject({
      name: "Mario",
      role: "staff",
      banned: false,
      email: placeholderEmail("mario"),
    });
    expect((await signIn(auth, "mario", STAFF_PASSWORD)).status).toBe(200);
  });

  it("creates an admin when asked", async () => {
    await createStaff(auth, admin.headers, { ...newStaff, role: "admin" });
    expect(await userRow("mario")).toMatchObject({ role: "admin" });
  });

  it("normalizes the username", async () => {
    await expect(
      createStaff(auth, admin.headers, { ...newStaff, username: "  Mario.Rossi " }),
    ).resolves.toEqual({ ok: true });
    expect(await userRow("mario.rossi")).toBeDefined();
  });

  it.each([
    ["a 9-char password", { ...newStaff, password: "nine-char" }],
    ["a 129-char password", { ...newStaff, password: "x".repeat(129) }],
    ["a 2-char username", { ...newStaff, username: "ma" }],
    ["a username with a hyphen", { ...newStaff, username: "ma-rio" }],
    ["an empty name", { ...newStaff, name: "" }],
    ["role owner", { ...newStaff, role: "owner" }],
    ["a non-object", "mario"],
    ["null", null],
  ])("rejects %s as invalid and creates nothing", async (_label, input) => {
    const before = await userCount(db);
    await expect(createStaff(auth, admin.headers, input)).resolves.toEqual({
      ok: false,
      error: "invalid",
    });
    expect(await userCount(db)).toBe(before);
  });

  it.each(["anna", "ANNA"])("reports %j as usernameTaken", async (username) => {
    await expect(createStaff(auth, admin.headers, { ...newStaff, username })).resolves.toEqual({
      ok: false,
      error: "usernameTaken",
    });
  });

  it("lets exactly one of two concurrent creates of the same username win", async () => {
    const results = await Promise.all([
      createStaff(auth, admin.headers, newStaff),
      createStaff(auth, admin.headers, { ...newStaff, name: "Other Mario" }),
    ]);
    expect(results).toContainEqual({ ok: true });
    expect(results).toContainEqual({ ok: false, error: "usernameTaken" });
    expect(await db.selectFrom("user").where("username", "=", "mario").execute()).toHaveLength(1);
  });

  it.each([
    ["a staff actor", () => staff.headers],
    ["no session", () => new Headers()],
  ])("is forbidden for %s", async (_label, headers) => {
    await expect(createStaff(auth, headers(), newStaff)).resolves.toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await userRow("mario")).toBeUndefined();
  });
});

describe("setDisabled", () => {
  it("disables a user, ends their sessions and blocks sign-in", async () => {
    expect(await sessionCount(db, staff.actor.id)).toBe(1);
    await expect(
      setDisabled(auth, db, admin.headers, admin.actor, {
        userId: staff.actor.id,
        disabled: true,
      }),
    ).resolves.toEqual({ ok: true });

    expect(await isBanned(staff.actor.id)).toBe(true);
    expect(await sessionCount(db, staff.actor.id)).toBe(0);
    expect((await signIn(auth, "anna", STAFF_PASSWORD)).status).toBe(403);
  });

  it("enables a disabled user again", async () => {
    const input = { userId: staff.actor.id, disabled: true };
    await setDisabled(auth, db, admin.headers, admin.actor, input);
    await expect(
      setDisabled(auth, db, admin.headers, admin.actor, { ...input, disabled: false }),
    ).resolves.toEqual({ ok: true });
    expect(await isBanned(staff.actor.id)).toBe(false);
    expect((await signIn(auth, "anna", STAFF_PASSWORD)).status).toBe(200);
  });

  it("refuses to disable yourself", async () => {
    await expect(
      setDisabled(auth, db, admin.headers, admin.actor, {
        userId: admin.actor.id,
        disabled: true,
      }),
    ).resolves.toEqual({ ok: false, error: "self" });
    expect(await isBanned(admin.actor.id)).toBe(false);
    expect(await sessionCount(db, admin.actor.id)).toBe(1);
  });

  it("lets an admin disable another admin while one stays active", async () => {
    const vice = await loggedIn(auth, {
      username: "vice",
      password: ADMIN_PASSWORD,
      role: "admin",
    });
    await expect(
      setDisabled(auth, db, admin.headers, admin.actor, { userId: vice.actor.id, disabled: true }),
    ).resolves.toEqual({ ok: true });
  });

  it("keeps one admin active when two admins disable each other at once", async () => {
    const vice = await loggedIn(auth, {
      username: "vice",
      password: ADMIN_PASSWORD,
      role: "admin",
    });
    const results = await Promise.all([
      setDisabled(auth, db, admin.headers, admin.actor, { userId: vice.actor.id, disabled: true }),
      setDisabled(auth, db, vice.headers, vice.actor, { userId: admin.actor.id, disabled: true }),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const active = await db
      .selectFrom("user")
      .select("id")
      .where("role", "=", "admin")
      .where("banned", "=", false)
      .execute();
    expect(active).toHaveLength(1);
  });

  it("is forbidden for a staff actor", async () => {
    const other = await addUser(auth, { username: "zeno", password: STAFF_PASSWORD });
    await expect(
      setDisabled(auth, db, staff.headers, staff.actor, { userId: other, disabled: true }),
    ).resolves.toEqual({ ok: false, error: "forbidden" });
    expect(await isBanned(other)).toBe(false);
  });

  it("reports an unknown user as notFound", async () => {
    await expect(
      setDisabled(auth, db, admin.headers, admin.actor, { userId: "missing", disabled: true }),
    ).resolves.toEqual({ ok: false, error: "notFound" });
  });

  it.each([
    [{ userId: "x" }],
    [{ disabled: true }],
    [{ userId: "x", disabled: "yes" }],
    [{ userId: "", disabled: true }],
    [null],
  ])("rejects %j as invalid", async (input) => {
    await expect(setDisabled(auth, db, admin.headers, admin.actor, input)).resolves.toEqual({
      ok: false,
      error: "invalid",
    });
  });
});

describe("resetPassword", () => {
  it("sets a new password, invalidates the old one and ends sessions", async () => {
    await expect(
      resetPassword(auth, admin.headers, { userId: staff.actor.id, password: NEW_PASSWORD }),
    ).resolves.toEqual({ ok: true });

    expect(await sessionCount(db, staff.actor.id)).toBe(0);
    expect((await signIn(auth, "anna", STAFF_PASSWORD)).status).toBe(401);
    expect((await signIn(auth, "anna", NEW_PASSWORD)).status).toBe(200);
  });

  it.each(["nine-char", "x".repeat(129)])("rejects password %j as invalid", async (password) => {
    await expect(
      resetPassword(auth, admin.headers, { userId: staff.actor.id, password }),
    ).resolves.toEqual({ ok: false, error: "invalid" });
    expect((await signIn(auth, "anna", STAFF_PASSWORD)).status).toBe(200);
  });

  it("is forbidden for a staff actor", async () => {
    await expect(
      resetPassword(auth, staff.headers, { userId: admin.actor.id, password: NEW_PASSWORD }),
    ).resolves.toEqual({ ok: false, error: "forbidden" });
    expect((await signIn(auth, "boss", ADMIN_PASSWORD)).status).toBe(200);
  });

  it("reports an unknown user as notFound", async () => {
    await expect(
      resetPassword(auth, admin.headers, { userId: "missing", password: NEW_PASSWORD }),
    ).resolves.toEqual({ ok: false, error: "notFound" });
  });
});
