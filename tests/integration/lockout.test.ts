import { sql, type Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, getDb } from "@/db/client";
import { runMigrations } from "@/db/migrator";
import type { DB } from "@/db/types";
import type { Auth } from "@/lib/auth/auth";
import {
  clearFailures,
  listLocked,
  LOCKOUT_FAILURES,
  LOCKOUT_MS,
  LOCKOUT_WINDOW_MS,
  lockedUntil,
  recordFailure,
} from "@/lib/auth/lockout";
import { addUser, sessionCount, signIn, testAuth, truncateAuth } from "./auth-fixtures";
import { testDatabaseUrl } from "./test-database";

const PASSWORD = "correct-horse-1";
const WRONG = "wrong-password-1";

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

// Each attempt comes from a new address (uniqueIp), as from a spread-out attacker.
async function fail(username: string, times: number): Promise<void> {
  for (let i = 0; i < times; i++) {
    const response = await signIn(auth, username, WRONG);
    expect(response.status, `attempt ${i + 1}`).toBe(401);
  }
}

describe("sign-in lockout per username", () => {
  it("locks after 10 wrong passwords, even for the right password and from new addresses", async () => {
    await fail("anna", LOCKOUT_FAILURES);
    const locked = await signIn(auth, "anna", PASSWORD);
    expect(locked.status).toBe(429);
    expect(await locked.json()).toMatchObject({ code: "ACCOUNT_LOCKED" });
    expect(await sessionCount(db)).toBe(0);
  });

  it("does not lock after 9, and a correct sign-in starts the count again", async () => {
    await fail("anna", LOCKOUT_FAILURES - 1);
    expect((await signIn(auth, "anna", PASSWORD)).status).toBe(200);
    await fail("anna", LOCKOUT_FAILURES - 1);
    expect((await signIn(auth, "anna", PASSWORD)).status).toBe(200);
  });

  it("locks one username only", async () => {
    await addUser(auth, { username: "bruno", password: PASSWORD });
    await fail("anna", LOCKOUT_FAILURES);
    expect((await signIn(auth, "bruno", PASSWORD)).status).toBe(200);
  });

  it("counts a username however it is typed", async () => {
    await fail("ANNA", LOCKOUT_FAILURES / 2);
    await fail("Anna", LOCKOUT_FAILURES / 2);
    expect((await signIn(auth, "anna", PASSWORD)).status).toBe(429);
  });

  it("answers an unknown username the same way, so a lock confirms nothing", async () => {
    await fail("nobody", LOCKOUT_FAILURES);
    const unknown = await signIn(auth, "nobody", WRONG);
    await fail("anna", LOCKOUT_FAILURES);
    const known = await signIn(auth, "anna", WRONG);
    expect(unknown.status).toBe(429);
    expect(await unknown.json()).toEqual(await known.json());
  });

  it("does not count a disabled account's correct password as a guess", async () => {
    await sql`update "user" set banned = true where id = ${annaId}`.execute(db);
    for (let i = 0; i < LOCKOUT_FAILURES; i++) await signIn(auth, "anna", PASSWORD);
    await expect(lockedUntil(db, "anna")).resolves.toBeNull();
  });
});

describe("lockout bookkeeping", () => {
  const t0 = new Date("2027-07-10T09:00:00Z");
  const at = (ms: number) => new Date(t0.getTime() + ms);

  async function failAt(times: number, when: Date) {
    let lock: Date | null = null;
    for (let i = 0; i < times; i++) lock = (await recordFailure(db, "anna", when)) ?? lock;
    return lock;
  }

  it("reports the lock only on the failure that sets it, ending 15 minutes later", async () => {
    await expect(failAt(LOCKOUT_FAILURES - 1, t0)).resolves.toBeNull();
    await expect(recordFailure(db, "anna", t0)).resolves.toEqual(at(LOCKOUT_MS));
    await expect(recordFailure(db, "anna", t0)).resolves.toBeNull();
    await expect(lockedUntil(db, "anna", at(LOCKOUT_MS - 1))).resolves.toEqual(at(LOCKOUT_MS));
  });

  it("is temporary: unlocked once the 15 minutes are over, counting from 1 again", async () => {
    await failAt(LOCKOUT_FAILURES, t0);
    await expect(lockedUntil(db, "anna", at(LOCKOUT_MS))).resolves.toBeNull();
    await expect(failAt(LOCKOUT_FAILURES - 1, at(LOCKOUT_MS))).resolves.toBeNull();
  });

  it("forgets failures older than the 15-minute window", async () => {
    await failAt(LOCKOUT_FAILURES - 1, t0);
    await expect(failAt(1, at(LOCKOUT_WINDOW_MS + 1))).resolves.toBeNull();
    await expect(lockedUntil(db, "anna", at(LOCKOUT_WINDOW_MS + 1))).resolves.toBeNull();
  });

  it("counts every one of many simultaneous failures", async () => {
    const results = await Promise.all(
      Array.from({ length: LOCKOUT_FAILURES + 5 }, () => recordFailure(db, "anna", t0)),
    );
    expect(results.filter((lock) => lock !== null)).toHaveLength(1);
    await expect(lockedUntil(db, "anna", t0)).resolves.toEqual(at(LOCKOUT_MS));
  });

  it("unlocks when an admin clears it, and lists only current locks", async () => {
    await failAt(LOCKOUT_FAILURES, t0);
    await recordFailure(db, "bruno", t0);
    expect([...(await listLocked(db, t0)).keys()]).toEqual(["anna"]);
    await clearFailures(db, "anna");
    await expect(lockedUntil(db, "anna", t0)).resolves.toBeNull();
  });
});
