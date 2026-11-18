"use server";

import { z } from "zod";
import { writePreferenceCookie } from "@/lib/preference-cookie";
import { THEME_COOKIE, themes } from "./config";

const themeSchema = z.enum(themes);

export type SetThemeResult = { ok: true } | { ok: false };

/** Saves the theme in the `theme` cookie: per device, so a shared tablet keeps its own (ADR 0016). */
export async function setTheme(input: unknown): Promise<SetThemeResult> {
  const parsed = themeSchema.safeParse(input);
  if (!parsed.success) return { ok: false };

  await writePreferenceCookie(THEME_COOKIE, parsed.data);
  return { ok: true };
}
