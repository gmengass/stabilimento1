export const locales = ["it", "en"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "it";

export const LOCALE_COOKIE = "locale";

export const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** Constant until VenueSettings exists (see docs/PROGRESS.md open questions). */
export const VENUE_TIME_ZONE = "Europe/Rome";
