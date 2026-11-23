import { sql, type Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, getDb } from "@/db/client";
import { runMigrations } from "@/db/migrator";
import type { DB } from "@/db/types";
import type { Auth } from "@/lib/auth/auth";
import {
  clearFailures,
  forgetOld,
  FROM_ADDRESS,
  FROM_ANYWHERE,
  listLocked,
  LOCKOUT_MS,
  LOCKOUT_WINDOW_MS,
  lockedUntil,
  recordFailure,
} from "@/lib/auth/lockout";
import { addUser, sessionCount, signIn, testAuth, truncateAuth, uniqueIp } from "./auth-fixtures";
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
  // The per-IP limit (5 a minute, `auth-flow.test.ts`) would stop one address first: off here.
  auth = testAuth(db, undefined, undefined, false);
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

const ATTACKER = "10.200.0.1";
const PER_ADDRESS = FROM_ADDRESS.failures;

async function fail(username: string, times: number, ip?: string): Promise<void> {
  for (let i = 0; i < times; i++) {
    const response = await signIn(auth, username, WRONG, { ip: ip ?? uniqueIp() });
    expect(response.status, `attempt ${i + 1}`).toBe(401);
  }
}

// Seeds the from-anywhere count directly: 100 sign-ins would be slow and add nothing.
async function nearlyLockedEverywhere(username: string): Promise<void> {
  await sql`insert into login_failure (key, failures, first_failed_at)
    values (${username}, ${FROM_ANYWHERE.failures - 1}, now())`.execute(db);
}

describe("sign-in lockout", () => {
  it("locks a username from one address after 10 wrong passwords, even for the right one", async () => {
    await fail("anna", PER_ADDRESS, ATTACKER);
    const locked = await signIn(auth, "anna", PASSWORD, { ip: ATTACKER });
    expect(locked.status).toBe(429);
    expect(await locked.json()).toMatchObject({ code: "ACCOUNT_LOCKED" });
    expect(await sessionCount(db)).toBe(0);
  });

  it("still lets the real user in from another device", async () => {
    await fail("anna", PER_ADDRESS, ATTACKER);
    expect((await signIn(auth, "anna", PASSWORD, { ip: "10.200.0.2" })).status).toBe(200);
  });

  it("locks a username everywhere after 100 wrong passwords from any addresses", async () => {
    await nearlyLockedEverywhere("anna");
    await fail("anna", 1);
    expect((await signIn(auth, "anna", PASSWORD)).status).toBe(429);
  });

  it("does not lock after 9 from one address, and a correct sign-in clears every count", async () => {
    await fail("anna", PER_ADDRESS - 1, ATTACKER);
    await nearlyLockedEverywhere("bruno");
    await addUser(auth, { username: "bruno", password: PASSWORD });
    expect((await signIn(auth, "anna", PASSWORD, { ip: ATTACKER })).status).toBe(200);
    await fail("anna", PER_ADDRESS - 1, ATTACKER);
    expect((await signIn(auth, "anna", PASSWORD, { ip: ATTACKER })).status).toBe(200);
  });

  it("locks one username only", async () => {
    await addUser(auth, { username: "bruno", password: PASSWORD });
    await fail("anna", PER_ADDRESS, ATTACKER);
    expect((await signIn(auth, "bruno", PASSWORD, { ip: ATTACKER })).status).toBe(200);
  });

  it("counts a username however it is typed", async () => {
    await fail("ANNA", PER_ADDRESS / 2, ATTACKER);
    await fail("Anna", PER_ADDRESS / 2, ATTACKER);
    expect((await signIn(auth, "anna", PASSWORD, { ip: ATTACKER })).status).toBe(429);
  });

  it("answers an unknown username the same way, so a lock confirms nothing", async () => {
    await fail("nobody", PER_ADDRESS, ATTACKER);
    const unknown = await signIn(auth, "nobody", WRONG, { ip: ATTACKER });
    await fail("anna", PER_ADDRESS, ATTACKER);
    const known = await signIn(auth, "anna", WRONG, { ip: ATTACKER });
    expect(unknown.status).toBe(429);
    expect(await unknown.json()).toEqual(await known.json());
  });

  it("does not count a disabled account's correct password as a guess", async () => {
    await sql`update "user" set banned = true where id = ${annaId}`.execute(db);
    for (let i = 0; i < PER_ADDRESS; i++) await signIn(auth, "anna", PASSWORD, { ip: ATTACKER });
    expect((await listLocked(db)).size).toBe(0);
  });
});

describe("lockout bookkeeping", () => {
  const t0 = new Date("2027-07-10T09:00:00Z");
  const at = (ms: number) => new Date(t0.getTime() + ms);
  const key = "anna@10.0.0.9";

  async function failAt(times: number, when: Date) {
    let lock: Date | null = null;
    for (let i = 0; i < times; i++)
      lock = (await recordFailure(db, key, FROM_ADDRESS, when)) ?? lock;
    return lock;
  }

  it("reports the lock only on the failure that sets it, ending 15 minutes later", async () => {
    await expect(failAt(PER_ADDRESS - 1, t0)).resolves.toBeNull();
    await expect(recordFailure(db, key, FROM_ADDRESS, t0)).resolves.toEqual(at(LOCKOUT_MS));
    await expect(recordFailure(db, key, FROM_ADDRESS, t0)).resolves.toBeNull();
    await expect(lockedUntil(db, [key], at(LOCKOUT_MS - 1))).resolves.toEqual(at(LOCKOUT_MS));
  });

  it("is temporary: unlocked once the 15 minutes are over, counting from 1 again", async () => {
    await failAt(PER_ADDRESS, t0);
    await expect(lockedUntil(db, [key], at(LOCKOUT_MS))).resolves.toBeNull();
    await expect(failAt(PER_ADDRESS - 1, at(LOCKOUT_MS))).resolves.toBeNull();
  });

  it("forgets failures older than the 15-minute window", async () => {
    await failAt(PER_ADDRESS - 1, t0);
    await expect(failAt(1, at(LOCKOUT_WINDOW_MS + 1))).resolves.toBeNull();
    await expect(lockedUntil(db, [key], at(LOCKOUT_WINDOW_MS + 1))).resolves.toBeNull();
  });

  it("counts every one of many simultaneous failures", async () => {
    const results = await Promise.all(
      Array.from({ length: PER_ADDRESS + 5 }, () => recordFailure(db, key, FROM_ADDRESS, t0)),
    );
    expect(results.filter((lock) => lock !== null)).toHaveLength(1);
    await expect(lockedUntil(db, [key], t0)).resolves.toEqual(at(LOCKOUT_MS));
  });

  it("lists locked usernames, and unlocking clears every address's count", async () => {
    await failAt(PER_ADDRESS, t0);
    await recordFailure(db, "anna", FROM_ANYWHERE, t0);
    await recordFailure(db, "bruno@10.0.0.9", FROM_ADDRESS, t0);
    await recordFailure(db, "annabel@10.0.0.9", FROM_ADDRESS, t0);
    expect([...(await listLocked(db, t0)).entries()]).toEqual([["anna", at(LOCKOUT_MS)]]);
    await clearFailures(db, "anna");
    const left = await db.selectFrom("login_failure").select("key").orderBy("key").execute();
    expect(left.map((row) => row.key)).toEqual(["annabel@10.0.0.9", "bruno@10.0.0.9"]);
  });

  it("deletes old unlocked counts and keeps current locks", async () => {
    await recordFailure(db, "old@10.0.0.9", FROM_ADDRESS, at(-LOCKOUT_WINDOW_MS - 1));
    await failAt(PER_ADDRESS, t0);
    await forgetOld(db, at(1));
    await expect(lockedUntil(db, [key], at(1))).resolves.not.toBeNull();
    const left = await db.selectFrom("login_failure").select("key").execute();
    expect(left.map((row) => row.key)).toEqual([key]);
  });
});
