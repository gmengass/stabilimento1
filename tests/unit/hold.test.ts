import { describe, expect, it } from "vitest";
import { holdInstant } from "@/lib/booking/hold";

// The hold time is local Europe/Rome time on the booking day (ADR 0004, ADR 0015).
describe("holdInstant", () => {
  it.each([
    ["summer (CEST, UTC+2)", "2027-06-20", "11:00", "2027-06-20T09:00:00.000Z"],
    ["winter (CET, UTC+1)", "2027-01-10", "11:00", "2027-01-10T10:00:00.000Z"],
    ["a late hold in summer", "2027-06-20", "13:30", "2027-06-20T11:30:00.000Z"],
    ["with seconds", "2027-06-20", "13:30:15", "2027-06-20T11:30:15.000Z"],
    ["midnight (the day before in UTC)", "2027-06-20", "00:00", "2027-06-19T22:00:00.000Z"],
    ["just before midnight", "2027-06-20", "23:59", "2027-06-20T21:59:00.000Z"],
  ])("%s: %s %s", (_name, date, time, expected) => {
    expect(holdInstant(date, time).toISOString()).toBe(expected);
  });

  describe("daylight-saving days (last Sundays of March and October)", () => {
    it.each([
      ["spring forward, 11:00 is already CEST", "2027-03-28", "11:00", "2027-03-28T09:00:00.000Z"],
      ["spring forward, 01:30 is still CET", "2027-03-28", "01:30", "2027-03-28T00:30:00.000Z"],
      ["the day before spring forward", "2027-03-27", "11:00", "2027-03-27T10:00:00.000Z"],
      ["fall back, 11:00 is already CET", "2027-10-31", "11:00", "2027-10-31T10:00:00.000Z"],
      ["the day before fall back", "2027-10-30", "11:00", "2027-10-30T09:00:00.000Z"],
    ])("%s", (_name, date, time, expected) => {
      expect(holdInstant(date, time).toISOString()).toBe(expected);
    });
  });

  it("doesn't depend on the process time zone", () => {
    const before = process.env.TZ;
    try {
      process.env.TZ = "America/New_York";
      expect(holdInstant("2027-06-20", "11:00").toISOString()).toBe("2027-06-20T09:00:00.000Z");
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  });
});
