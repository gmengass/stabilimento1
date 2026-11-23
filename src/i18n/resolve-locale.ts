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

/**
 * The language saved on a user, if it should win over the cookie. A communal account is shared
 * by several tablets, so each tablet keeps its own language in its cookie (ADR 0025).
 */
export function savedLocale(user: { locale: string; communal: boolean } | null): string | null {
  return user && !user.communal ? user.locale : null;
}
