export const locales = ["it", "en"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "it";

export const LOCALE_COOKIE = "locale";

export const timeZone = "Europe/Rome";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}
