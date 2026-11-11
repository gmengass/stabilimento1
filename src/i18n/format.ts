import { VENUE_TIME_ZONE, type Locale } from "./config";

const BOOKING_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses a booking day (ADR 0004) as a UTC instant so the process time zone never shifts it. */
function bookingDayToUtc(day: string): Date {
  const match = BOOKING_DAY.exec(day);
  if (!match) throw new RangeError(`Invalid booking day: ${JSON.stringify(day)}`);
  const [year, month, date] = match.slice(1).map(Number);
  const utc = new Date(Date.UTC(year, month - 1, date));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== date
  ) {
    throw new RangeError(`Invalid booking day: ${JSON.stringify(day)}`);
  }
  return utc;
}

export function formatBookingDate(day: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(bookingDayToUtc(day));
}

export function formatTimestamp(at: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: VENUE_TIME_ZONE,
  }).format(at);
}

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, { useGrouping: "always" }).format(value);
}

/** Money is integer euro cents. */
export function formatEur(cents: number, locale: Locale): string {
  if (!Number.isSafeInteger(cents)) throw new RangeError(`Cents must be an integer: ${cents}`);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
    useGrouping: "always",
  }).format(cents / 100);
}
