"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { THEME_COOKIE, themes } from "./config";

const themeSchema = z.enum(themes);

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export type SetThemeResult = { ok: true } | { ok: false };

/** Saves the theme in the `theme` cookie: per device, so a shared tablet keeps its own (ADR 0016). */
export async function setTheme(input: unknown): Promise<SetThemeResult> {
  const parsed = themeSchema.safeParse(input);
  if (!parsed.success) return { ok: false };

  const store = await cookies();
  store.set(THEME_COOKIE, parsed.data, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    maxAge: ONE_YEAR_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
  return { ok: true };
}
