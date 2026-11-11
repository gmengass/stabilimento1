import { afterEach, describe, expect, it } from "vitest";
import { formatBookingDate, formatEur, formatNumber, formatTimestamp } from "@/i18n/format";

/** Intl emits NBSP (U+00A0) / narrow NBSP (U+202F); compare against plain spaces. */
const normalize = (s: string) => s.replace(/[  ]/g, " ");

const originalTz = process.env.TZ;

afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

// Extreme offsets (UTC-10 and UTC+14) plus the venue zone: a local-midnight
// parse of "YYYY-MM-DD" would shift the day in at least one of these.
const processTimeZones = ["UTC", "Europe/Rome", "Pacific/Honolulu", "Pacific/Kiritimati"];

const bookingDays = [
  { day: "2026-03-29", it: "29 marzo 2026", en: "March 29, 2026" }, // EU DST starts
  { day: "2026-10-25", it: "25 ottobre 2026", en: "October 25, 2026" }, // EU DST ends
  { day: "2026-01-01", it: "1 gennaio 2026", en: "January 1, 2026" },
  { day: "2026-12-31", it: "31 dicembre 2026", en: "December 31, 2026" },
  { day: "2028-02-29", it: "29 febbraio 2028", en: "February 29, 2028" }, // leap day
];

describe("formatBookingDate", () => {
  describe.each(processTimeZones)("with process TZ %s", (tz) => {
    it.each(bookingDays)("formats $day as the same calendar day", ({ day, it: itText, en }) => {
      process.env.TZ = tz;
      expect(normalize(formatBookingDate(day, "it"))).toBe(itText);
      expect(normalize(formatBookingDate(day, "en"))).toBe(en);
    });
  });

  it.each([
    "2026-02-30",
    "2027-02-29",
    "2026-13-01",
    "2026-00-10",
    "29/03/2026",
    "2026-3-29",
    "",
    "2026-03-29T00:00:00Z",
  ])("throws RangeError for invalid day %j", (day) => {
    expect(() => formatBookingDate(day, "it")).toThrow(RangeError);
  });
});

describe("formatTimestamp", () => {
  it("converts summer UTC to Europe/Rome (UTC+2)", () => {
    const at = new Date("2026-07-01T10:00:00Z");
    expect(normalize(formatTimestamp(at, "it"))).toContain("12:00");
    expect(normalize(formatTimestamp(at, "it"))).toContain("01/07/26");
    expect(normalize(formatTimestamp(at, "en"))).toContain("12:00 PM");
    expect(normalize(formatTimestamp(at, "en"))).toContain("7/1/26");
  });

  it("converts winter UTC to Europe/Rome (UTC+1)", () => {
    const at = new Date("2026-12-01T10:00:00Z");
    expect(normalize(formatTimestamp(at, "it"))).toContain("11:00");
    expect(normalize(formatTimestamp(at, "en"))).toContain("11:00 AM");
  });

  it("moves to the next Rome day for a late-evening UTC instant", () => {
    const at = new Date("2026-07-01T23:30:00Z");
    expect(normalize(formatTimestamp(at, "it"))).toContain("02/07/26");
    expect(normalize(formatTimestamp(at, "it"))).toContain("01:30");
  });

  it("does not depend on the process time zone", () => {
    const at = new Date("2026-07-01T10:00:00Z");
    process.env.TZ = "Pacific/Honolulu";
    const honolulu = formatTimestamp(at, "it");
    process.env.TZ = "Pacific/Kiritimati";
    expect(formatTimestamp(at, "it")).toBe(honolulu);
  });
});

describe("formatNumber", () => {
  it("uses locale separators (including grouping for 4-digit numbers in it)", () => {
    expect(normalize(formatNumber(1234.5, "it"))).toBe("1.234,5");
    expect(normalize(formatNumber(1234.5, "en"))).toBe("1,234.5");
  });
});

describe("formatEur", () => {
  it("formats integer cents as euros", () => {
    expect(normalize(formatEur(123450, "it"))).toBe("1.234,50 €");
    expect(normalize(formatEur(123450, "en"))).toBe("€1,234.50");
  });

  it("formats zero and small amounts", () => {
    expect(normalize(formatEur(0, "it"))).toBe("0,00 €");
    expect(normalize(formatEur(0, "en"))).toBe("€0.00");
    expect(normalize(formatEur(5, "it"))).toBe("0,05 €");
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "throws RangeError for non-integer cents %j",
    (cents) => {
      expect(() => formatEur(cents, "it")).toThrow(RangeError);
    },
  );
});
