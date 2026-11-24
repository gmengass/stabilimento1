/** "arturo" and "sera" are the club's light and dark looks, with larger map tiles (ADR 0031). */
export const themes = ["system", "light", "dark", "arturo", "sera"] as const;

export type Theme = (typeof themes)[number];

/** "system" follows the device's light/dark setting. */
export const defaultTheme: Theme = "system";

export const THEME_COOKIE = "theme";

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (themes as readonly string[]).includes(value);
}

/** A missing or unknown cookie value falls back to the default. */
export function resolveTheme(cookie: string | undefined): Theme {
  return isTheme(cookie) ? cookie : defaultTheme;
}
