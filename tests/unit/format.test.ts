import { describe, expect, it } from "vitest";
import { formatBookingDate, formatEur } from "@/i18n/format";

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
