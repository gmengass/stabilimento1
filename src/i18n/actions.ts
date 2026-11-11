"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE_SECONDS, locales } from "./config";
import { saveUserLocalePreference } from "./locale";

const localeSchema = z.enum(locales);

export async function setLocale(locale: unknown): Promise<void> {
  const parsed = localeSchema.parse(locale);
  await saveUserLocalePreference(parsed);
  (await cookies()).set(LOCALE_COOKIE, parsed, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS,
  });
  refresh();
}
