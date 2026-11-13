import { afterEach, describe, expect, it } from "vitest";
import {
  addDays,
  formatBookingDate,
  formatEur,
  formatTimestamp,
  isBookingDate,
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

describe("formatEur", () => {
  it.each([
    [1234.5, "it", "1.234,50 €"],
    [1234.5, "en", "€1,234.50"],
    [0, "it", "0,00 €"],
    [0, "en", "€0.00"],
    [1234567.891, "it", "1.234.567,89 €"],
  ] as const)("formats %d in %s as %s", (amount, locale, expected) => {
    expect(normalizeSpaces(formatEur(amount, locale))).toBe(expected);
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

describe("venueToday", () => {
  it("uses the Rome calendar day, not UTC", () => {
    expect(venueToday(new Date("2026-07-01T22:30:00Z"))).toBe("2026-07-02");
    expect(venueToday(new Date("2026-12-31T22:59:00Z"))).toBe("2026-12-31");
    expect(venueToday(new Date("2026-12-31T23:00:00Z"))).toBe("2027-01-01");
  });
});
