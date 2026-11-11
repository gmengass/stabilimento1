import { cookies } from "next/headers";
import { LOCALE_COOKIE, type Locale } from "./config";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Writes the `locale` cookie. Only callable from a Server Action or Route Handler. */
export async function writeLocaleCookie(locale: Locale): Promise<void> {
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    maxAge: ONE_YEAR_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
}
