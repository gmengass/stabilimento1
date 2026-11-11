import { timeZone, type Locale } from "./config";

/** Intl tags per interface locale: English uses day-month order. */
const intlTag: Record<Locale, string> = { it: "it-IT", en: "en-GB" };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses a booking day (ADR 0004) as a UTC midnight, rejecting impossible dates. */
function parseBookingDate(date: string): Date {
  const match = ISO_DATE.exec(date);
  if (!match) throw new RangeError(`Invalid booking date: ${JSON.stringify(date)}`);
  const [year, month, day] = match.slice(1).map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  const valid =
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;
  if (!valid) throw new RangeError(`Invalid booking date: ${JSON.stringify(date)}`);
  return parsed;
}

/** True for a real calendar day written as `YYYY-MM-DD`. */
export function isBookingDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    parseBookingDate(value);
    return true;
  } catch {
    return false;
  }
}

/** Adds whole days to a booking day; no time zone is involved. */
export function addDays(date: string, days: number): string {
  const parsed = parseBookingDate(date);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

/** Today's booking day at the venue (Europe/Rome), whatever the server's own time zone. */
export function venueToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
}

/** Formats a `YYYY-MM-DD` booking day as a calendar day, with no time zone shift. */
export function formatBookingDate(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlTag[locale], {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parseBookingDate(date));
}

/** Formats a UTC instant in the venue time zone; convert only here, at the edge (ADR 0004). */
export function formatTimestamp(at: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(intlTag[locale], {
    dateStyle: "short",
    timeStyle: "short",
    timeZone,
  }).format(at);
}

export function formatEur(amount: number, locale: Locale): string {
  return new Intl.NumberFormat(intlTag[locale], {
    style: "currency",
    currency: "EUR",
    useGrouping: "always",
  }).format(amount);
}
