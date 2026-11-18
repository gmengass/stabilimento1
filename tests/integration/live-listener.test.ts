import { sql, type Kysely } from "kysely";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDb, getDb } from "@/db/client";
import type { DB } from "@/db/types";
import type { LiveEvent } from "@/lib/live/sse";
import { startListener, stopListener, subscribe, subscriberCount } from "@/lib/live/listener";
import { testDatabaseUrl } from "./test-database";

// The listener's own connection: by application name, or by its last statement.
const LISTENER_BACKEND = sql`pid <> pg_backend_pid() and datname = current_database()
  and (application_name = 'live-listener' or query ilike 'LISTEN%')`;

let db: Kysely<DB>;
const unsubscribers: (() => void)[] = [];

beforeAll(() => {
  db = createDb(testDatabaseUrl());
});

afterEach(async () => {
  unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
  await stopListener();
});

afterAll(async () => {
  await stopListener();
  await db.destroy();
  await getDb().destroy();
});

async function eventually(check: () => boolean | Promise<boolean>, ms = 5_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return check();
}

/** Subscribes and records what arrives. */
function record(): LiveEvent[] {
  const events: LiveEvent[] = [];
  unsubscribers.push(subscribe((e) => events.push(e)));
  return events;
}

const notify = () => sql`select pg_notify('map_changed', '')`.execute(db);

async function listenerBackends(): Promise<number> {
  const { rows } = await sql<{ n: number }>`
    select count(*)::int as n from pg_stat_activity where ${LISTENER_BACKEND}`.execute(db);
  return rows[0]?.n ?? 0;
}

describe("subscribe", () => {
  it("counts subscribers and forgets one that unsubscribes", () => {
    const before = subscriberCount();
    const first = subscribe(() => undefined);
    const second = subscribe(() => undefined);
    expect(subscriberCount()).toBe(before + 2);
    first();
    expect(subscriberCount()).toBe(before + 1);
    first();
    expect(subscriberCount()).toBe(before + 1);
    second();
    expect(subscriberCount()).toBe(before);
  });
});

describe("startListener", () => {
  it("tells every subscriber 'changed' on a map_changed notification", async () => {
    await startListener(testDatabaseUrl());
    const a = record();
    const b = record();
    await notify();
    expect(await eventually(() => a.length > 0 && b.length > 0)).toBe(true);
    expect(a).toEqual(["changed"]);
    expect(b).toEqual(["changed"]);
  });

  it("ignores other channels", async () => {
    await startListener(testDatabaseUrl());
    const events = record();
    await sql`select pg_notify('something_else', '')`.execute(db);
    await notify();
    expect(await eventually(() => events.length > 0)).toBe(true);
    expect(events).toEqual(["changed"]);
  });

  it("is idempotent: one LISTEN connection, one event per notification", async () => {
    await Promise.all([startListener(testDatabaseUrl()), startListener(testDatabaseUrl())]);
    await startListener(testDatabaseUrl());
    expect(await listenerBackends()).toBe(1);
    const events = record();
    await notify();
    await notify();
    expect(await eventually(() => events.length >= 2)).toBe(true);
    // A late duplicate would show up here.
    await new Promise((r) => setTimeout(r, 300));
    expect(events).toEqual(["changed", "changed"]);
  });

  it("stops delivering to a subscriber that unsubscribed", async () => {
    await startListener(testDatabaseUrl());
    const gone: LiveEvent[] = [];
    const unsubscribe = subscribe((e) => gone.push(e));
    const staying = record();
    unsubscribe();
    await notify();
    expect(await eventually(() => staying.length > 0)).toBe(true);
    expect(gone).toEqual([]);
  });

  it("after the connection drops, reconnects, sends 'resync', then delivers again", async () => {
    await startListener(testDatabaseUrl());
    const events = record();
    const { rows } = await sql<{ killed: boolean }>`
      select pg_terminate_backend(pid) as killed from pg_stat_activity
      where ${LISTENER_BACKEND}`.execute(db);
    expect(rows).toEqual([{ killed: true }]);

    expect(await eventually(() => events.includes("resync"), 10_000)).toBe(true);
    expect(await eventually(async () => (await listenerBackends()) === 1)).toBe(true);
    const seen = events.length;
    await notify();
    expect(await eventually(() => events.length > seen)).toBe(true);
    expect(events.slice(seen)).toEqual(["changed"]);
  }, 20_000);
});

describe("start and stop racing", () => {
  it("keeps one connection when a stop and a start land during the first connect", async () => {
    const first = startListener(testDatabaseUrl());
    await stopListener();
    await startListener(testDatabaseUrl());
    await first.catch(() => undefined);
    // The stale first connect must not stay behind as a second LISTEN.
    await new Promise((r) => setTimeout(r, 300));
    expect(await listenerBackends()).toBe(1);
    const events = record();
    await notify();
    expect(await eventually(() => events.length > 0)).toBe(true);
    await new Promise((r) => setTimeout(r, 300));
    expect(events).toEqual(["changed"]);
  });
});

describe("stopListener", () => {
  it("closes the LISTEN connection, and the listener can start again", async () => {
    await startListener(testDatabaseUrl());
    expect(await listenerBackends()).toBe(1);
    await stopListener();
    expect(await eventually(async () => (await listenerBackends()) === 0)).toBe(true);
    await stopListener();

    await startListener(testDatabaseUrl());
    const events = record();
    await notify();
    expect(await eventually(() => events.length > 0)).toBe(true);
    expect(events).toEqual(["changed"]);
  });
});
