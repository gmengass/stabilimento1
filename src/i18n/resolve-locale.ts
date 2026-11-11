import { defaultLocale, isLocale, type Locale } from "./config";

export interface LocaleSources {
  /** The logged-in user's saved preference. */
  user?: string | null;
  cookie?: string | null;
}

/** First valid of user preference, cookie, default (ADR 0005). */
export function resolveLocale({ user, cookie }: LocaleSources): Locale {
  if (isLocale(user)) return user;
  if (isLocale(cookie)) return cookie;
  return defaultLocale;
}
