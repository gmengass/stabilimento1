import { sql, type Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, getDb } from "@/db/client";
import { runMigrations } from "@/db/migrator";
import type { DB } from "@/db/types";
import { setupBeach, loadBeach } from "@/lib/beach/layout";
import {
  cancelBooking,
  createBooking,
  loadOccupancy,
  MAX_BOOKING_DAYS,
  type CreateBookingInput,
} from "@/lib/booking/bookings";
import { testDatabaseUrl } from "./test-database";

let db: Kysely<DB>;
let migrated = false;
let areaId: number;
/** Spot id by umbrella number. */
let spot: Record<number, number>;
const USER = "u-staff";

beforeAll(async () => {
  db = createDb(testDatabaseUrl());
  const result = await runMigrations(db, "up");
  if (result.error) throw result.error;
  migrated = true;
});

beforeEach(async () => {
  if (!migrated) throw new Error("migrations did not run; refusing to truncate");
  await sql`truncate venue, area, area_line, spot, booking, booking_spot, spot_day,
    "user" restart identity cascade`.execute(db);
  await db
    .insertInto("user")
    .values({ id: USER, name: "Anna", email: "anna@example.invalid", username: "anna" })
    .execute();
  await setupBeach(db, { venueName: "Lido", lines: 2, umbrellasPerLine: 5 });
  const beach = await loadBeach(db);
  if (!beach) throw new Error("no beach");
  areaId = beach.areaId;
  spot = Object.fromEntries(beach.lines.flatMap((l) => l.spots.map((s) => [s.number, s.id])));
});

afterAll(async () => {
  await db.destroy();
  await getDb().destroy();
});

function booking(overrides: Partial<CreateBookingInput> = {}): CreateBookingInput {
  return {
    customerName: "Rossi",
    customerPhone: "+39 333 1234567",
    startDate: "2027-07-10",
    endDate: "2027-07-12",
    spots: [{ spotId: spot[101], sunbeds: 2 }],
    ...overrides,
  };
}

async function spotDayCount(): Promise<number> {
  const { rows } = await sql<{ n: number }>`select count(*)::int as n from spot_day`.execute(db);
  return rows[0].n;
}

describe("createBooking", () => {
  it("books one spot_day per spot per day, ends inclusive", async () => {
    const result = await createBooking(
      db,
      USER,
      booking({
        spots: [
          { spotId: spot[101], sunbeds: 3 },
          { spotId: spot[102], sunbeds: 2 },
        ],
      }),
    );
    expect(result).toMatchObject({ ok: true });
    expect(await spotDayCount()).toBe(6);
    for (const date of ["2027-07-10", "2027-07-12"]) {
      const occupancy = await loadOccupancy(db, areaId, date);
      expect(occupancy[spot[101]]).toMatchObject({
        customerName: "Rossi",
        spots: [
          { number: 101, sunbeds: 3 },
          { number: 102, sunbeds: 2 },
        ],
      });
    }
    expect(await loadOccupancy(db, areaId, "2027-07-09")).toEqual({});
    expect(await loadOccupancy(db, areaId, "2027-07-13")).toEqual({});
  });

  it("stores a single day as kind day, several days as multi_day", async () => {
    await createBooking(db, USER, booking({ endDate: "2027-07-10" }));
    await createBooking(db, USER, booking({ spots: [{ spotId: spot[201], sunbeds: 2 }] }));
    const kinds = await db.selectFrom("booking").select("kind").orderBy("id").execute();
    expect(kinds.map((k) => k.kind)).toEqual(["day", "multi_day"]);
  });

  it("refuses an overlapping booking and names the clashing spot and days", async () => {
    await createBooking(db, USER, booking());
    const result = await createBooking(
      db,
      USER,
      booking({
        startDate: "2027-07-12",
        endDate: "2027-07-14",
        spots: [
          { spotId: spot[102], sunbeds: 2 },
          { spotId: spot[101], sunbeds: 2 },
        ],
      }),
    );
    expect(result).toEqual({
      ok: false,
      error: "taken",
      clashes: [{ spotNumber: 101, date: "2027-07-12" }],
    });
    expect(await spotDayCount()).toBe(3);
  });

  it("allows a booking that starts the day after another ends", async () => {
    await createBooking(db, USER, booking());
    const next = await createBooking(
      db,
      USER,
      booking({ startDate: "2027-07-13", endDate: "2027-07-13" }),
    );
    expect(next).toMatchObject({ ok: true });
  });

  it("lets exactly one of many concurrent bookings for the same spot win", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        createBooking(db, USER, booking({ customerName: `C${i}` })),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.error === "taken")).toHaveLength(7);
    expect(await spotDayCount()).toBe(3);
  });

  it("refuses more sunbeds than the umbrella holds", async () => {
    const result = await createBooking(
      db,
      USER,
      booking({ spots: [{ spotId: spot[101], sunbeds: 4 }] }),
    );
    expect(result).toEqual({ ok: false, error: "sunbeds" });
  });

  it("refuses an unknown spot", async () => {
    const result = await createBooking(
      db,
      USER,
      booking({ spots: [{ spotId: 99999, sunbeds: 1 }] }),
    );
    expect(result).toEqual({ ok: false, error: "sunbeds" });
  });

  it.each([
    { customerName: " " },
    { customerPhone: "abc" },
    { customerPhone: "12" },
    { startDate: "2027-02-30" },
    { startDate: "2027-07-12", endDate: "2027-07-11" },
    { endDate: "2027-09-08" },
    { spots: [] },
    {
      spots: [
        { spotId: 1, sunbeds: 1 },
        { spotId: 1, sunbeds: 1 },
      ],
    },
    { spots: [{ spotId: 1, sunbeds: -1 }] },
  ])("rejects invalid input %o and writes nothing", async (override) => {
    const result = await createBooking(db, USER, booking(override as Partial<CreateBookingInput>));
    expect(result).toEqual({ ok: false, error: "invalid" });
    expect(await spotDayCount()).toBe(0);
  });

  it(`allows up to ${MAX_BOOKING_DAYS} days`, async () => {
    const result = await createBooking(
      db,
      USER,
      booking({ startDate: "2027-07-01", endDate: "2027-08-29" }),
    );
    expect(result).toMatchObject({ ok: true });
    expect(await spotDayCount()).toBe(MAX_BOOKING_DAYS);
  });
});

describe("cancelBooking", () => {
  it("frees every day and keeps the booking as cancelled history", async () => {
    const created = await createBooking(db, USER, booking());
    if (!created.ok) throw new Error("setup failed");
    expect(await cancelBooking(db, USER, { bookingId: created.bookingId })).toEqual({ ok: true });
    expect(await spotDayCount()).toBe(0);
    const row = await db
      .selectFrom("booking")
      .select(["status", "cancelled_by"])
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ status: "cancelled", cancelled_by: USER });
    expect(await createBooking(db, USER, booking())).toMatchObject({ ok: true });
  });

  it("reports notFound for a missing or already cancelled booking", async () => {
    const created = await createBooking(db, USER, booking());
    if (!created.ok) throw new Error("setup failed");
    await cancelBooking(db, USER, { bookingId: created.bookingId });
    expect(await cancelBooking(db, USER, { bookingId: created.bookingId })).toEqual({
      ok: false,
      error: "notFound",
    });
    expect(await cancelBooking(db, USER, { bookingId: 424242 })).toEqual({
      ok: false,
      error: "notFound",
    });
    expect(await cancelBooking(db, USER, { bookingId: "1" })).toEqual({
      ok: false,
      error: "invalid",
    });
  });
});

describe("the database itself", () => {
  it("rejects a second booked row for the same spot and day", async () => {
    await createBooking(db, USER, booking({ endDate: "2027-07-10" }));
    const bs = await db
      .selectFrom("booking_spot")
      .select(["id", "spot_id"])
      .executeTakeFirstOrThrow();
    await expect(
      sql`insert into spot_day (spot_id, booking_spot_id, date)
          values (${bs.spot_id}, ${bs.id}, '2027-07-10'::date + 0)`.execute(db),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("rejects a spot_day whose spot differs from its booking_spot", async () => {
    await createBooking(db, USER, booking({ endDate: "2027-07-10" }));
    const bs = await db.selectFrom("booking_spot").select("id").executeTakeFirstOrThrow();
    await expect(
      sql`insert into spot_day (spot_id, booking_spot_id, date)
          values (${spot[105]}, ${bs.id}, '2027-07-20')`.execute(db),
    ).rejects.toMatchObject({ code: "23503" });
  });
});
