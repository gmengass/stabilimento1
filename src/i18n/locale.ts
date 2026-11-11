import { defaultLocale, locales, type Locale } from "./config";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

interface LocaleSources {
  userPreference: Locale | null;
  cookie: string | undefined;
}

/** ADR 0005: saved user preference, then the `locale` cookie, then Italian. */
export function resolveLocale({ userPreference, cookie }: LocaleSources): Locale {
  if (userPreference) return userPreference;
  return isLocale(cookie) ? cookie : defaultLocale;
}

/** Seam for the Auth item: returns the logged-in user's saved locale. */
export async function getUserLocalePreference(): Promise<Locale | null> {
  return null;
}

/** Seam for the Auth item: saves the logged-in user's locale. */
export async function saveUserLocalePreference(locale: Locale): Promise<void> {
  void locale;
}
