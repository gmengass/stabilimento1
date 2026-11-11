"use server";

import { z } from "zod";
import { getDb } from "@/db/client";
import { readCurrentUser } from "@/lib/auth/session";
import { locales } from "./config";
import { writeLocaleCookie } from "./locale-cookie";

const localeSchema = z.enum(locales);

export type SetLocaleResult = { ok: true } | { ok: false };

/** Saves the interface language in the `locale` cookie and, when logged in, on the user. */
export async function setLocale(input: unknown): Promise<SetLocaleResult> {
  const parsed = localeSchema.safeParse(input);
  if (!parsed.success) return { ok: false };

  await writeLocaleCookie(parsed.data);
  const user = await readCurrentUser();
  if (user) {
    await getDb()
      .updateTable("user")
      .set({ locale: parsed.data })
      .where("id", "=", user.id)
      .execute();
  }
  return { ok: true };
}
