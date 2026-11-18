import { writePreferenceCookie } from "@/lib/preference-cookie";
import { LOCALE_COOKIE, type Locale } from "./config";

/** Writes the `locale` cookie. Only callable from a Server Action or Route Handler. */
export async function writeLocaleCookie(locale: Locale): Promise<void> {
  await writePreferenceCookie(LOCALE_COOKIE, locale);
}
