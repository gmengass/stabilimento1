import { sql, type Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, getDb } from "@/db/client";
import { createMigrator, runMigrations } from "@/db/migrator";
import type { DB } from "@/db/types";
import {
  ACTING_IDLE_MS,
  chooseActing,
  clearActing,
  listActingChoices,
  resolveActor,
} from "@/lib/auth/acting";
import type { Auth } from "@/lib/auth/auth";
import { createStaff, listUsers, setDisabled } from "@/lib/auth/staff";
import type { CurrentUser } from "@/lib/auth/session";
import { addUser, loggedIn, post, testAuth, truncateAuth } from "./auth-fixtures";
import { testDatabaseUrl } from "./test-database";

const CHECK_VIOLATION = "23514";
const PASSWORD = "tablet-password-1";
const MINUTE = 60_000;

let db: Kysely<DB>;
let auth: Auth;
let migrated = false;

let tablet: { actor: CurrentUser; headers: Headers };
let anna: string;
let bruno: string;

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
  tablet = await loggedIn(auth, { username: "tablet1", password: PASSWORD, communal: true });
  anna = await addUser(auth, { username: "anna", password: PASSWORD, name: "Anna" });
  bruno = await addUser(auth, { username: "bruno", password: PASSWORD, name: "Bruno" });
});

afterAll(async () => {
  await db.destroy();
  await getDb().destroy();
});

const sessionId = () => tablet.actor.sessionId;
const rows = () => db.selectFrom("acting_staff").selectAll().execute();

describe("schema (ADR 0024)", () => {
  it("defaults communal to false", async () => {
    const row = await db
      .selectFrom("user")
      .select("communal")
      .where("id", "=", anna)
      .executeTakeFirstOrThrow();
    expect(row.communal).toBe(false);
  });

  it("refuses a communal admin", async () => {
    await expect(
      db.updateTable("user").set({ role: "admin" }).where("id", "=", tablet.actor.id).execute(),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it("drops the acting selection with the session", async () => {
    await chooseActing(db, sessionId(), anna);
    await db.deleteFrom("session").where("id", "=", sessionId()).execute();
    expect(await rows()).toEqual([]);
  });

  it("rolls back cleanly", async () => {
    const down = await createMigrator(db).migrateTo("0012_venue_stock");
    expect(down.error).toBeUndefined();
    const columns = await sql<{ column_name: string }>`select column_name
      from information_schema.columns where table_name = 'user' and column_name = 'communal'`.execute(db);
    expect(columns.rows).toEqual([]);
    const up = await runMigrations(db, "up");
    expect(up.error).toBeUndefined();
  });
});

describe("listActingChoices", () => {
  it("lists active, non-communal staff by name", async () => {
    await addUser(auth, { username: "admin1", password: PASSWORD, role: "admin" });
    const carla = await addUser(auth, { username: "carla", password: PASSWORD, name: "Carla" });
    await db.updateTable("user").set({ banned: true }).where("id", "=", carla).execute();
    const choices = await listActingChoices(db);
    expect(choices.map((c) => c.name)).toEqual(["Anna", "Bruno"]);
    expect(choices.map((c) => c.id)).toEqual([anna, bruno]);
  });
});

describe("resolveActor", () => {
  it("returns a normal account's own id, with no acting row", async () => {
    const own = await loggedIn(auth, { username: "marco", password: PASSWORD });
    await expect(resolveActor(db, own.actor)).resolves.toEqual({ ok: true, actorId: own.actor.id });
    expect(await rows()).toEqual([]);
  });

  it("asks who is acting when a communal session has no one", async () => {
    await expect(resolveActor(db, tablet.actor)).resolves.toEqual({
      ok: false,
      error: "needsActor",
    });
  });

  it("returns the chosen staff member, never the communal account", async () => {
    await expect(chooseActing(db, sessionId(), anna)).resolves.toEqual({ ok: true });
    await expect(resolveActor(db, tablet.actor)).resolves.toEqual({ ok: true, actorId: anna });
  });

  it("asks again after more than 2 minutes idle", async () => {
    const t0 = new Date("2027-07-10T09:00:00Z");
    await chooseActing(db, sessionId(), anna, t0);
    const stale = new Date(t0.getTime() + ACTING_IDLE_MS + 1);
    await expect(resolveActor(db, tablet.actor, stale)).resolves.toEqual({
      ok: false,
      error: "needsActor",
    });
  });

  it("accepts an action exactly at the idle limit", async () => {
    const t0 = new Date("2027-07-10T09:00:00Z");
    await chooseActing(db, sessionId(), anna, t0);
    const edge = new Date(t0.getTime() + ACTING_IDLE_MS);
    await expect(resolveActor(db, tablet.actor, edge)).resolves.toEqual({ ok: true, actorId: anna });
  });

  it("refreshes the idle time on every action", async () => {
    const t0 = new Date("2027-07-10T09:00:00Z");
    await chooseActing(db, sessionId(), anna, t0);
    await resolveActor(db, tablet.actor, new Date(t0.getTime() + 90_000));
    const later = new Date(t0.getTime() + 180_000);
    await expect(resolveActor(db, tablet.actor, later)).resolves.toEqual({ ok: true, actorId: anna });
  });

  it("does not let a refused action refresh a stale selection", async () => {
    const t0 = new Date("2027-07-10T09:00:00Z");
    await chooseActing(db, sessionId(), anna, t0);
    await resolveActor(db, tablet.actor, new Date(t0.getTime() + 3 * MINUTE));
    await expect(
      resolveActor(db, tablet.actor, new Date(t0.getTime() + 3 * MINUTE + 1000)),
    ).resolves.toMatchObject({ ok: false });
  });

  it("serves simultaneous actions from one selection", async () => {
    await chooseActing(db, sessionId(), anna);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => resolveActor(db, tablet.actor)),
    );
    expect(results.every((r) => r.ok && r.actorId === anna)).toBe(true);
  });

  it("refuses once the chosen staff member is disabled", async () => {
    await chooseActing(db, sessionId(), anna);
    await db.updateTable("user").set({ banned: true }).where("id", "=", anna).execute();
    await expect(resolveActor(db, tablet.actor)).resolves.toMatchObject({
      ok: false,
      error: "needsActor",
    });
  });

  it("keeps the two tablets' selections apart", async () => {
    const second = await loggedIn(auth, { username: "tablet2", password: PASSWORD, communal: true });
    await chooseActing(db, sessionId(), anna);
    await chooseActing(db, second.actor.sessionId, bruno);
    await expect(resolveActor(db, tablet.actor)).resolves.toMatchObject({ actorId: anna });
    await expect(resolveActor(db, second.actor)).resolves.toMatchObject({ actorId: bruno });
  });
});

describe("chooseActing / clearActing", () => {
  it("replaces the previous choice, keeping one row per session", async () => {
    await chooseActing(db, sessionId(), anna);
    await chooseActing(db, sessionId(), bruno);
    expect(await rows()).toHaveLength(1);
    await expect(resolveActor(db, tablet.actor)).resolves.toMatchObject({ actorId: bruno });
  });

  it("refuses unknown, disabled, communal and admin accounts", async () => {
    const admin = await addUser(auth, { username: "boss", password: PASSWORD, role: "admin" });
    const carla = await addUser(auth, { username: "carla", password: PASSWORD });
    await db.updateTable("user").set({ banned: true }).where("id", "=", carla).execute();
    for (const id of ["nobody", carla, tablet.actor.id, admin]) {
      await expect(chooseActing(db, sessionId(), id)).resolves.toEqual({
        ok: false,
        error: "invalid",
      });
    }
    expect(await rows()).toEqual([]);
  });

  it("'Not me' clears the selection", async () => {
    await chooseActing(db, sessionId(), anna);
    await clearActing(db, sessionId());
    await expect(resolveActor(db, tablet.actor)).resolves.toMatchObject({ ok: false });
  });
});

describe("disabling staff (ADR 0024)", () => {
  it("removes their acting selections", async () => {
    const admin = await loggedIn(auth, { username: "boss", password: PASSWORD, role: "admin" });
    await chooseActing(db, sessionId(), anna);
    const result = await setDisabled(auth, db, admin.headers, admin.actor, {
      userId: anna,
      disabled: true,
    });
    expect(result).toEqual({ ok: true });
    expect(await rows()).toEqual([]);
  });
});

describe("creating communal accounts", () => {
  it("flags the account communal and lists it as such", async () => {
    const admin = await loggedIn(auth, { username: "boss", password: PASSWORD, role: "admin" });
    const result = await createStaff(auth, admin.headers, {
      username: "tablet9",
      name: "Tablet Bar",
      password: PASSWORD,
      communal: true,
    });
    expect(result).toEqual({ ok: true });
    const users = await listUsers(db);
    expect(users.find((u) => u.username === "tablet9")).toMatchObject({ communal: true });
    expect(users.find((u) => u.username === "anna")).toMatchObject({ communal: false });
  });

  it("refuses a communal admin", async () => {
    const admin = await loggedIn(auth, { username: "boss", password: PASSWORD, role: "admin" });
    const result = await createStaff(auth, admin.headers, {
      username: "tablet9",
      name: "Tablet Bar",
      password: PASSWORD,
      role: "admin",
      communal: true,
    });
    expect(result).toEqual({ ok: false, error: "invalid" });
  });
});

describe("session length (ADR 0024)", () => {
  const HOUR = 3_600_000;

  async function lifetime(username: string): Promise<number> {
    const row = await db
      .selectFrom("session")
      .innerJoin("user", "user.id", "session.user_id")
      .select(["session.expires_at", "session.created_at"])
      .where("user.username", "=", username)
      .executeTakeFirstOrThrow();
    return row.expires_at.getTime() - row.created_at.getTime();
  }

  it("lasts 30 days for a communal account", async () => {
    expect(Math.abs((await lifetime("tablet1")) - 30 * 24 * HOUR)).toBeLessThan(MINUTE);
  });

  it("still lasts 12 hours for a normal account", async () => {
    await loggedIn(auth, { username: "marco", password: PASSWORD });
    expect(Math.abs((await lifetime("marco")) - 12 * HOUR)).toBeLessThan(MINUTE);
  });

  it("gives an admin 12 hours too", async () => {
    await loggedIn(auth, { username: "boss", password: PASSWORD, role: "admin" });
    expect(Math.abs((await lifetime("boss")) - 12 * HOUR)).toBeLessThan(MINUTE);
  });

  it("ends a banned communal account's session on the next request", async () => {
    const admin = await loggedIn(auth, { username: "boss", password: PASSWORD, role: "admin" });
    await setDisabled(auth, db, admin.headers, admin.actor, {
      userId: tablet.actor.id,
      disabled: true,
    });
    await expect(auth.api.getSession({ headers: tablet.headers })).resolves.toBeNull();
  });
});

describe("communal accounts and the HTTP surface", () => {
  it("cannot set the flag over HTTP", async () => {
    const response = await post(auth, "/update-user", { communal: false }, { headers: tablet.headers });
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});
