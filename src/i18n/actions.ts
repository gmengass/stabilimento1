"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { LOCALE_COOKIE, locales } from "./config";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

const localeSchema = z.enum(locales);

export type SetLocaleResult = { ok: true } | { ok: false };

/** Saves the interface language in the `locale` cookie. Auth will also save it on the user. */
export async function setLocale(input: unknown): Promise<SetLocaleResult> {
  const parsed = localeSchema.safeParse(input);
  if (!parsed.success) return { ok: false };

  const store = await cookies();
  store.set(LOCALE_COOKIE, parsed.data, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    maxAge: ONE_YEAR_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
  return { ok: true };
}
