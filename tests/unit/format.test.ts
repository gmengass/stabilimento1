import { afterEach, describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  formatBookingDate,
  formatCents,
  formatShortWeekdayDate,
  formatTimestamp,
  formatWeekdayDate,
  isBookingDate,
  venueClock,
  venueDayStart,
  venueToday,
} from "@/i18n/format";

/** Intl uses U+00A0 / U+202F between number and symbol; compare with plain spaces. */
function normalizeSpaces(value: string): string {
  return value.replace(/[   ]/g, " ");
}

describe("formatBookingDate", () => {
  it.each([
    ["2026-03-29", "it", "29 marzo 2026"],
    ["2026-03-29", "en", "29 March 2026"],
    ["2026-10-25", "it", "25 ottobre 2026"],
    ["2026-10-25", "en", "25 October 2026"],
    ["2026-01-01", "it", "1 gennaio 2026"],
    ["2026-01-01", "en", "1 January 2026"],
    ["2026-12-31", "it", "31 dicembre 2026"],
    ["2028-02-29", "en", "29 February 2028"],
  ] as const)("formats %s in %s as %s", (date, locale, expected) => {
    expect(normalizeSpaces(formatBookingDate(date, locale))).toBe(expected);
  });

  it.each(["2026-02-30", "2026-13-01", "2026-00-10", "2027-02-29", "not-a-date", "", "2026-3-29"])(
    "throws RangeError on %j",
    (date) => {
      expect(() => formatBookingDate(date, "it")).toThrow(RangeError);
    },
  );
});

describe("formatWeekdayDate and formatShortWeekdayDate", () => {
  it.each([
    ["2026-11-18", "it", "mercoledì 18 nov 2026", "mer 18 nov"],
    ["2026-11-18", "en", "Wednesday, 18 Nov 2026", "Wed 18 Nov"],
    ["2026-03-29", "it", "domenica 29 mar 2026", "dom 29 mar"],
    ["2026-01-01", "it", "giovedì 1 gen 2026", "gio 1 gen"],
    ["2026-12-31", "en", "Thursday, 31 Dec 2026", "Thu 31 Dec"],
  ] as const)("formats %s in %s as %s / %s", (date, locale, full, short) => {
    expect(normalizeSpaces(formatWeekdayDate(date, locale))).toBe(full);
    expect(normalizeSpaces(formatShortWeekdayDate(date, locale))).toBe(short);
  });

  it("throws RangeError on an impossible day", () => {
    expect(() => formatWeekdayDate("2026-02-30", "it")).toThrow(RangeError);
    expect(() => formatShortWeekdayDate("2026-02-30", "it")).toThrow(RangeError);
  });
});

describe("formatCents", () => {
  it.each([
    [123450, "it", "1.234,50 €"],
    [123450, "en", "€1,234.50"],
    [0, "it", "0,00 €"],
    [0, "en", "€0.00"],
    [123456789, "it", "1.234.567,89 €"],
  ] as const)("formats %d in %s as %s", (amount, locale, expected) => {
    expect(normalizeSpaces(formatCents(amount, locale))).toBe(expected);
  });
});

describe("formatBookingDate ignores the process time zone", () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it.each(["UTC", "Pacific/Honolulu", "Europe/Rome", "Pacific/Kiritimati"])(
    "keeps the calendar day with TZ=%s",
    (tz) => {
      process.env.TZ = tz;
      expect(formatBookingDate("2026-03-29", "it")).toBe("29 marzo 2026");
      expect(formatBookingDate("2026-10-25", "en")).toBe("25 October 2026");
      expect(formatBookingDate("2026-01-01", "it")).toBe("1 gennaio 2026");
    },
  );
});

describe("formatTimestamp", () => {
  it.each([
    ["2026-07-01T10:00:00Z", "it", "12:00"],
    ["2026-07-01T10:00:00Z", "en", "12:00"],
    ["2026-12-01T10:00:00Z", "it", "11:00"],
    ["2026-03-29T00:30:00Z", "it", "01:30"],
    ["2026-03-29T01:30:00Z", "it", "03:30"],
    ["2026-10-25T00:30:00Z", "it", "02:30"],
    ["2026-10-25T01:30:00Z", "it", "02:30"],
  ] as const)("shows %s in Europe/Rome (%s) as %s", (iso, locale, time) => {
    expect(normalizeSpaces(formatTimestamp(new Date(iso), locale))).toContain(time);
  });

  it("rolls the date over at Rome midnight, not UTC midnight", () => {
    expect(formatTimestamp(new Date("2026-06-30T22:30:00Z"), "it")).toContain("01/07/26");
  });
});

describe("isBookingDate", () => {
  it.each(["2026-07-01", "2028-02-29", "2000-01-01", "2099-12-31"])("accepts %s", (value) => {
    expect(isBookingDate(value)).toBe(true);
  });

  it.each([
    "2026-02-30",
    "2027-02-29",
    "1999-12-31",
    "2100-01-01",
    "2026-7-1",
    "01/07/2026",
    "",
    undefined,
    ["2026-07-01"],
  ])("rejects %o", (value) => {
    expect(isBookingDate(value)).toBe(false);
  });
});

describe("addDays", () => {
  it.each([
    ["2026-07-31", 1, "2026-08-01"],
    ["2026-01-01", -1, "2025-12-31"],
    ["2028-02-28", 1, "2028-02-29"],
    ["2026-03-28", 2, "2026-03-30"],
    ["2026-10-24", 2, "2026-10-26"],
  ] as const)("%s + %i = %s, across month, year, leap day and DST changes", (date, days, out) => {
    expect(addDays(date, days)).toBe(out);
  });
});

describe("daysBetween", () => {
  it.each([
    ["2026-07-10", "2026-07-10", 0],
    ["2026-07-10", "2026-07-09", -1],
    ["2026-07-10", "2026-07-11", 1],
    ["2025-12-31", "2026-01-01", 1],
    ["2026-03-28", "2026-03-30", 2],
    ["2026-10-26", "2026-10-24", -2],
    ["2028-02-28", "2028-03-01", 2],
  ] as const)("%s to %s is %i, across year, DST and leap day", (from, to, out) => {
    expect(daysBetween(from, to)).toBe(out);
  });
});

describe("venueToday", () => {
  it("uses the Rome calendar day, not UTC", () => {
    expect(venueToday(new Date("2026-07-01T22:30:00Z"))).toBe("2026-07-02");
    expect(venueToday(new Date("2026-12-31T22:59:00Z"))).toBe("2026-12-31");
    expect(venueToday(new Date("2026-12-31T23:00:00Z"))).toBe("2027-01-01");
  });
});

describe("venueDayStart", () => {
  it.each([
    ["2026-01-15", "2026-01-14T23:00:00.000Z"],
    ["2026-07-15", "2026-07-14T22:00:00.000Z"],
    ["2026-03-29", "2026-03-28T23:00:00.000Z"],
    ["2026-03-30", "2026-03-29T22:00:00.000Z"],
    ["2026-10-25", "2026-10-24T22:00:00.000Z"],
    ["2026-10-26", "2026-10-25T23:00:00.000Z"],
  ])("is 00:00 in Rome on %s, as the UTC instant %s", (date, utc) => {
    expect(venueDayStart(date).toISOString()).toBe(utc);
  });

  it("makes the spring-forward day 23 hours and the fall-back day 25", () => {
    const hours = (from: string, to: string) =>
      (venueDayStart(to).getTime() - venueDayStart(from).getTime()) / 3_600_000;
    expect(hours("2026-03-29", "2026-03-30")).toBe(23);
    expect(hours("2026-10-25", "2026-10-26")).toBe(25);
    expect(hours("2026-07-15", "2026-07-16")).toBe(24);
  });

  it("agrees with venueToday at the edges of the day", () => {
    for (const date of ["2026-03-29", "2026-10-25", "2026-07-15", "2026-12-31"]) {
      const start = venueDayStart(date);
      expect(venueToday(start)).toBe(date);
      expect(venueToday(new Date(start.getTime() - 1))).not.toBe(date);
    }
  });
});

describe("venueClock", () => {
  it("is the time in Rome, summer and winter, with midnight as 00:00", () => {
    expect(venueClock(new Date("2026-07-01T09:05:00Z"))).toBe("11:05");
    expect(venueClock(new Date("2026-12-31T22:59:00Z"))).toBe("23:59");
    expect(venueClock(new Date("2026-12-31T23:00:00Z"))).toBe("00:00");
  });
});
