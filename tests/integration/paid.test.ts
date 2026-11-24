import { sql, type Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, getDb } from "@/db/client";
import { runMigrations } from "@/db/migrator";
import type { DB } from "@/db/types";
import { loadBeach, setupBeach } from "@/lib/beach/layout";
import { listActivity, type Viewer } from "@/lib/booking/audit";
import { cancelBooking, createBooking, loadOccupancy } from "@/lib/booking/bookings";
import { moveBooking } from "@/lib/booking/move";
import { setPaid } from "@/lib/booking/paid";
import { createSeasonPass, endSeasonPass } from "@/lib/booking/passes";
import { createSeason, listSeasons } from "@/lib/booking/seasons";
import { undoEntry } from "@/lib/booking/undo";
import { bookingSuggestion, savePrices } from "@/lib/pricing/price-list";
import { priceChangedSincePaid } from "@/lib/pricing/suggest";
import { stampToday } from "./audit-clock";
import { testDatabaseUrl } from "./test-database";

let db: Kysely<DB>;
let migrated = false;
let areaId: number;
let spot: Record<number, number>;
const ANNA: Viewer = { id: "u-anna", role: "staff" };
const BRUNO: Viewer = { id: "u-bruno", role: "staff" };
const ADMIN: Viewer = { id: "u-admin", role: "admin" };
const BOOKED_ON = "2027-05-01";
/** After the test bookings' last day: a finished booking can still be ticked and undone. */
const LATER = "2027-08-01";
const AT = new Date("2027-07-10T08:00:00Z");

beforeAll(async () => {
  db = createDb(testDatabaseUrl());
  const result = await runMigrations(db, "up");
  if (result.error) throw result.error;
  migrated = true;
});

beforeEach(async () => {
  if (!migrated) throw new Error("migrations did not run; refusing to truncate");
  await sql`truncate venue, area, area_line, spot, season, price, booking, booking_spot, spot_day,
    audit_log, "user" restart identity cascade`.execute(db);
  await db
    .insertInto("user")
    .values([
      { id: ANNA.id, name: "Anna", email: "anna@example.invalid", username: "anna" },
      { id: BRUNO.id, name: "Bruno", email: "bruno@example.invalid", username: "bruno" },
      { id: ADMIN.id, name: "Admin", email: "admin@example.invalid", username: "boss" },
    ])
    .execute();
  await setupBeach(db, { venueName: "Lido", areaName: "Main", lines: 1, umbrellasPerLine: 5 });
  const beach = await loadBeach(db);
  if (!beach) throw new Error("no beach");
  areaId = beach.areaId;
  spot = Object.fromEntries(beach.lines.flatMap((l) => l.spots.map((s) => [s.number, s.id])));
  await createSeason(db, { name: "2027", startDate: "2027-06-01", endDate: "2027-09-15" });
  const seasonId = (await listSeasons(db))[0].id;
  // €10 a piece a day, €25 a bundle a day.
  const rows = Array.from({ length: 31 }, (_, i) => ({
    days: i + 1,
    single: (i + 1) * 1000,
    bundle: (i + 1) * 2500,
  }));
  await savePrices(db, { seasonId, rows });
});

afterAll(async () => {
  await db.destroy();
  await getDb().destroy();
});

async function book(sunbeds = 2): Promise<number> {
  const result = await createBooking(
    db,
    ANNA.id,
    {
      customerName: "Rossi",
      customerPhone: "+39 333 1234567",
      startDate: "2027-07-10",
      endDate: "2027-07-11",
      spots: [{ spotId: spot[101], sunbeds }],
    },
    BOOKED_ON,
  );
  if (!result.ok) throw new Error(result.error);
  return result.bookingId;
}

async function paidRow(bookingId: number) {
  return db
    .selectFrom("booking")
    .select(["paid_at", "paid_by", "paid_suggested_cents"])
    .where("id", "=", bookingId)
    .executeTakeFirstOrThrow();
}

async function lastEntryId(): Promise<number> {
  const row = await db
    .selectFrom("audit_log")
    .select("id")
    .orderBy("id", "desc")
    .executeTakeFirstOrThrow();
  return row.id;
}

async function undo(entryId: number, by: Viewer, today = LATER) {
  await stampToday(db, entryId, today);
  return undoEntry(db, by, { entryId }, today, new Date());
}

describe("setPaid", () => {
  it("records who ticked it, when, and the suggested price, with an activity entry", async () => {
    const id = await book();
    expect(await setPaid(db, ANNA.id, { bookingId: id, paid: true }, AT)).toEqual({ ok: true });
    expect(await paidRow(id)).toEqual({
      paid_at: AT,
      paid_by: ANNA.id,
      paid_suggested_cents: 5000,
    });
    const [entry] = await listActivity(db, new Date(0));
    expect(entry).toMatchObject({
      action: "paid",
      userName: "Anna",
      detail: { suggestedCents: 5000 },
    });
    const price = (await loadOccupancy(db, areaId, "2027-07-10"))[spot[101]].price;
    expect(price.paid).toEqual({ at: AT.toISOString(), byName: "Anna", suggestedCents: 5000 });
    expect(priceChangedSincePaid(price)).toBe(false);
  });

  it("clears the tick with an unpaid entry", async () => {
    const id = await book();
    await setPaid(db, ANNA.id, { bookingId: id, paid: true }, AT);
    expect(await setPaid(db, BRUNO.id, { bookingId: id, paid: false })).toEqual({ ok: true });
    expect(await paidRow(id)).toEqual({ paid_at: null, paid_by: null, paid_suggested_cents: null });
    expect((await listActivity(db, new Date(0)))[0]).toMatchObject({ action: "unpaid" });
  });

  it("refuses a tick that changes nothing, without an entry", async () => {
    const id = await book();
    expect(await setPaid(db, ANNA.id, { bookingId: id, paid: false })).toEqual({
      ok: false,
      error: "unchanged",
    });
    await setPaid(db, ANNA.id, { bookingId: id, paid: true });
    expect(await setPaid(db, BRUNO.id, { bookingId: id, paid: true })).toEqual({
      ok: false,
      error: "unchanged",
    });
    const entries = await listActivity(db, new Date(0));
    expect(entries.filter((e) => e.action === "paid")).toHaveLength(1);
  });

  it("gives one entry when two desks tick at once", async () => {
    const id = await book();
    const results = await Promise.all([
      setPaid(db, ANNA.id, { bookingId: id, paid: true }),
      setPaid(db, BRUNO.id, { bookingId: id, paid: true }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const entries = await listActivity(db, new Date(0));
    expect(entries.filter((e) => e.action === "paid")).toHaveLength(1);
  });

  it("refuses a cancelled booking and an unknown one", async () => {
    const id = await book();
    await cancelBooking(db, ANNA.id, { bookingId: id }, BOOKED_ON);
    expect(await setPaid(db, ANNA.id, { bookingId: id, paid: true })).toEqual({
      ok: false,
      error: "cancelled",
    });
    expect(await setPaid(db, ANNA.id, { bookingId: 999, paid: true })).toEqual({
      ok: false,
      error: "notFound",
    });
    expect(await setPaid(db, ANNA.id, { bookingId: id, paid: "yes" })).toEqual({
      ok: false,
      error: "invalid",
    });
  });

  it("records no price when the booking can't be priced", async () => {
    await sql`truncate price`.execute(db);
    const id = await book();
    await setPaid(db, ANNA.id, { bookingId: id, paid: true }, AT);
    expect((await paidRow(id)).paid_suggested_cents).toBeNull();
    expect((await listActivity(db, new Date(0)))[0].detail).toEqual({});
  });

  it("warns when the price changes after the tick", async () => {
    const id = await book(2);
    await setPaid(db, ANNA.id, { bookingId: id, paid: true }, AT);
    await db.updateTable("booking_spot").set({ sunbeds: 3 }).where("booking_id", "=", id).execute();
    const price = (await loadOccupancy(db, areaId, "2027-07-10"))[spot[101]].price;
    expect(price.suggestion?.totalCents).toBe(5000 + 2000);
    expect(priceChangedSincePaid(price)).toBe(true);
  });
});

describe("the tick's price and the map's price", () => {
  it("stay the same after a move to another umbrella", async () => {
    const id = await book();
    const move = { bookingId: id, spots: [{ fromSpotId: spot[101], toSpotId: spot[103] }] };
    expect(await moveBooking(db, ANNA.id, move, BOOKED_ON)).toEqual({ ok: true });
    await setPaid(db, ANNA.id, { bookingId: id, paid: true }, AT);
    const price = (await loadOccupancy(db, areaId, "2027-07-10"))[spot[103]].price;
    expect(price.suggestion?.totalCents).toBe((await bookingSuggestion(db, id))?.totalCents);
    expect(priceChangedSincePaid(price)).toBe(false);
  });
});

describe("undoing a paid tick", () => {
  it("lets the author undo it, even after the booking's last day", async () => {
    const id = await book();
    await setPaid(db, ANNA.id, { bookingId: id, paid: true }, AT);
    expect(await undo(await lastEntryId(), ANNA)).toEqual({ ok: true });
    expect((await paidRow(id)).paid_at).toBeNull();
  });

  it("puts back the original tick when an unpaid entry is undone", async () => {
    const id = await book();
    await setPaid(db, ANNA.id, { bookingId: id, paid: true }, AT);
    await setPaid(db, BRUNO.id, { bookingId: id, paid: false });
    expect(await undo(await lastEntryId(), BRUNO)).toEqual({ ok: true });
    expect(await paidRow(id)).toEqual({
      paid_at: AT,
      paid_by: ANNA.id,
      paid_suggested_cents: 5000,
    });
  });

  it("refuses other staff but lets an admin undo it", async () => {
    const id = await book();
    await setPaid(db, ANNA.id, { bookingId: id, paid: true }, AT);
    const entryId = await lastEntryId();
    expect(await undo(entryId, BRUNO)).toEqual({ ok: false, error: "forbidden" });
    expect(await undo(entryId, ADMIN)).toEqual({ ok: true });
  });

  it("refuses once the tick changed since", async () => {
    const id = await book();
    await setPaid(db, ANNA.id, { bookingId: id, paid: true }, AT);
    const entryId = await lastEntryId();
    await setPaid(db, ANNA.id, { bookingId: id, paid: false });
    expect(await undo(entryId, ANNA)).toEqual({ ok: false, error: "changed" });
  });

  it("changes only the tick, even after the pass's last day was set", async () => {
    const seasonId = (await listSeasons(db))[0].id;
    const sold = await createSeasonPass(
      db,
      ANNA.id,
      {
        seasonId,
        startDate: "2027-07-01",
        customerName: "Bianchi",
        spots: [{ spotId: spot[102], sunbeds: 2 }],
      },
      BOOKED_ON,
    );
    if (!sold.ok) throw new Error(sold.error);
    await setPaid(db, ANNA.id, { bookingId: sold.bookingId, paid: true }, AT);
    const paidEntry = await lastEntryId();
    await endSeasonPass(
      db,
      ANNA.id,
      { bookingId: sold.bookingId, lastDay: "2027-07-20" },
      BOOKED_ON,
    );
    expect(await undo(paidEntry, ANNA)).toEqual({ ok: true });
    const row = await db
      .selectFrom("booking")
      .select(["end_date", "status", "paid_at"])
      .where("id", "=", sold.bookingId)
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ end_date: "2027-07-20", status: "active", paid_at: null });
  });

  it("refuses once the booking was cancelled, and never brings it back", async () => {
    const id = await book();
    await setPaid(db, ANNA.id, { bookingId: id, paid: true }, AT);
    const paidEntry = await lastEntryId();
    await cancelBooking(db, ANNA.id, { bookingId: id }, BOOKED_ON);
    expect(await undo(paidEntry, ANNA)).toEqual({ ok: false, error: "changed" });
  });

  it("can undo the undo", async () => {
    const id = await book();
    await setPaid(db, ANNA.id, { bookingId: id, paid: true }, AT);
    await undo(await lastEntryId(), ANNA);
    expect(await undo(await lastEntryId(), ANNA)).toEqual({ ok: true });
    expect((await paidRow(id)).paid_by).toBe(ANNA.id);
  });
});
