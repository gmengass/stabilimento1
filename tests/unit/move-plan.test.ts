import { describe, expect, it } from "vitest";
import { addDays } from "@/i18n/format";
import { MAX_BOOKING_DAYS, MAX_SPOTS_PER_BOOKING } from "@/lib/booking/bookings";
import {
  datesBetween,
  moveSchema,
  planMove,
  type MovePlan,
  type PlannedDay,
} from "@/lib/booking/move";

/** Spot ids differ from umbrella numbers on purpose (101 → 1010). */
const S101 = 1010;
const S102 = 1020;
const S103 = 1030;
const S105 = 1050;
const D10 = "2027-07-10";
const D11 = "2027-07-11";
const D12 = "2027-07-12";
const D13 = "2027-07-13";
const D14 = "2027-07-14";

function days(spotId: number, from: string, to: string, state: PlannedDay["state"] = "booked") {
  const out: PlannedDay[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) out.push({ spotId, date, state });
  return out;
}

const pair = (fromSpotId: number, toSpotId: number) => ({ fromSpotId, toSpotId });

/** Rows sorted by (spot, date) so the comparison doesn't depend on output order. */
function sorted(plan: MovePlan): MovePlan {
  const by = (a: PlannedDay, b: PlannedDay) => a.spotId - b.spotId || a.date.localeCompare(b.date);
  return { removed: [...plan.removed].sort(by), added: [...plan.added].sort(by) };
}

const EMPTY: MovePlan = { removed: [], added: [] };

describe("planMove", () => {
  it("moves every day of one umbrella to the target", () => {
    expect(sorted(planMove(days(S101, D10, D12), [pair(S101, S105)]))).toEqual({
      removed: days(S101, D10, D12),
      added: days(S105, D10, D12),
    });
  });

  it("changes nothing when every umbrella maps to itself and the dates stay", () => {
    expect(planMove(days(S101, D10, D12), [pair(S101, S101)])).toEqual(EMPTY);
  });

  it("changes nothing when the same dates are given again", () => {
    expect(planMove(days(S101, D10, D12), [pair(S101, S101)], datesBetween(D10, D12))).toEqual(
      EMPTY,
    );
  });

  it("keeps the overlap on the same umbrella: 10–12 → 11–13 removes only 10 and adds only 13", () => {
    expect(planMove(days(S101, D10, D12), [pair(S101, S101)], datesBetween(D11, D13))).toEqual({
      removed: days(S101, D10, D10),
      added: days(S101, D13, D13),
    });
  });

  it("moves umbrella and dates together: nothing kept across umbrellas", () => {
    const plan = planMove(days(S101, D10, D12), [pair(S101, S105)], datesBetween(D12, D14));
    expect(sorted(plan)).toEqual({ removed: days(S101, D10, D12), added: days(S105, D12, D14) });
  });

  it("shortens and lengthens a range on every umbrella", () => {
    const current = [...days(S101, D10, D11), ...days(S102, D10, D11)];
    const spots = [pair(S101, S101), pair(S102, S102)];
    expect(sorted(planMove(current, spots, datesBetween(D10, D10)))).toEqual({
      removed: [...days(S101, D11, D11), ...days(S102, D11, D11)],
      added: [],
    });
    expect(sorted(planMove(current, spots, datesBetween(D10, D12)))).toEqual({
      removed: [],
      added: [...days(S101, D12, D12), ...days(S102, D12, D12)],
    });
  });

  it("writes no rows for a swap within the booking (same umbrellas, same days)", () => {
    const current = [...days(S101, D10, D12), ...days(S102, D10, D12)];
    expect(planMove(current, [pair(S101, S102), pair(S102, S101)])).toEqual(EMPTY);
  });

  it("handles a chain 101→102, 102→103 as freeing 101 and adding 103", () => {
    const current = [...days(S101, D10, D11), ...days(S102, D10, D11)];
    expect(sorted(planMove(current, [pair(S101, S102), pair(S102, S103)]))).toEqual({
      removed: days(S101, D10, D11),
      added: days(S103, D10, D11),
    });
  });

  it("moves only the days it is given (the caller passes days from the from day on)", () => {
    const fromD12 = days(S101, D12, D14);
    expect(sorted(planMove(fromD12, [pair(S101, S105)]))).toEqual({
      removed: fromD12,
      added: days(S105, D12, D14),
    });
  });

  it("moves released pass days as released (ADR 0012)", () => {
    const current = [
      ...days(S101, D11, D11),
      ...days(S101, D12, D13, "released"),
      ...days(S101, D14, D14),
    ];
    expect(sorted(planMove(current, [pair(S101, S105)]))).toEqual({
      removed: current,
      added: [
        ...days(S105, D11, D11),
        ...days(S105, D12, D13, "released"),
        ...days(S105, D14, D14),
      ],
    });
  });

  it("gives every umbrella exactly the new dates, all booked", () => {
    const current = [...days(S101, D10, D10), ...days(S102, D10, D10)];
    const plan = planMove(current, [pair(S101, S105), pair(S102, S102)], datesBetween(D13, D14));
    expect(sorted(plan)).toEqual({
      removed: current,
      added: [...days(S102, D13, D14), ...days(S105, D13, D14)],
    });
  });

  it("does not depend on the order of umbrellas or days", () => {
    const current = [...days(S102, D10, D11), ...days(S101, D10, D11)].reverse();
    expect(sorted(planMove(current, [pair(S102, S103), pair(S101, S105)]))).toEqual({
      removed: [...days(S101, D10, D11), ...days(S102, D10, D11)],
      added: [...days(S103, D10, D11), ...days(S105, D10, D11)],
    });
  });

  it("does not mutate its input", () => {
    const current = days(S101, D10, D12);
    const spots = [pair(S101, S105)];
    const dates = datesBetween(D11, D13);
    const copy = structuredClone({ current, spots, dates });
    planMove(current, spots, dates);
    expect({ current, spots, dates }).toEqual(copy);
  });
});

describe("datesBetween", () => {
  it("lists every day inclusive, across a month end", () => {
    expect(datesBetween("2027-07-30", "2027-08-02")).toEqual([
      "2027-07-30",
      "2027-07-31",
      "2027-08-01",
      "2027-08-02",
    ]);
    expect(datesBetween(D10, D10)).toEqual([D10]);
  });
});

describe("moveSchema", () => {
  const base = { bookingId: 1, spots: [pair(1, 2)] };
  const ok = (input: unknown) => moveSchema.safeParse(input).success;

  it("accepts a spot-only move, a move with new dates, and a move from a day", () => {
    expect(ok(base)).toBe(true);
    expect(ok({ ...base, startDate: D10, endDate: D12 })).toBe(true);
    expect(ok({ ...base, fromDate: D11 })).toBe(true);
    expect(ok({ bookingId: 1, spots: [pair(1, 2), pair(2, 1)] })).toBe(true);
  });

  it("accepts up to the booking limits", () => {
    expect(ok({ ...base, startDate: D10, endDate: addDays(D10, MAX_BOOKING_DAYS - 1) })).toBe(true);
    const many = Array.from({ length: MAX_SPOTS_PER_BOOKING }, (_, i) => pair(i + 1, i + 101));
    expect(ok({ bookingId: 1, spots: many })).toBe(true);
  });

  it.each([
    ["no booking id", { spots: [pair(1, 2)] }],
    ["a non-positive booking id", { ...base, bookingId: 0 }],
    ["a string booking id", { ...base, bookingId: "1" }],
    ["no umbrellas", { bookingId: 1, spots: [] }],
    ["a non-integer spot id", { bookingId: 1, spots: [pair(1.5, 2)] }],
    ["a non-positive target", { bookingId: 1, spots: [pair(1, 0)] }],
    ["two umbrellas onto one target", { bookingId: 1, spots: [pair(1, 3), pair(2, 3)] }],
    ["the same umbrella twice", { bookingId: 1, spots: [pair(1, 2), pair(1, 3)] }],
    [
      "too many umbrellas",
      {
        bookingId: 1,
        spots: Array.from({ length: MAX_SPOTS_PER_BOOKING + 1 }, (_, i) => pair(i + 1, i + 101)),
      },
    ],
    ["a start without an end", { ...base, startDate: D10 }],
    ["an end without a start", { ...base, endDate: D10 }],
    ["an end before the start", { ...base, startDate: D12, endDate: D10 }],
    [
      "more than the longest booking",
      { ...base, startDate: D10, endDate: addDays(D10, MAX_BOOKING_DAYS) },
    ],
    ["new dates and a from day together", { ...base, startDate: D10, endDate: D12, fromDate: D11 }],
    ["an impossible date", { ...base, startDate: "2027-02-30", endDate: "2027-03-01" }],
    ["a malformed from day", { ...base, fromDate: "11/07/2027" }],
  ])("rejects %s", (_name, input) => {
    expect(ok(input)).toBe(false);
  });
});
