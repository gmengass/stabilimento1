"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { readCurrentUser } from "@/lib/auth/session";
import { setupBeach, type SetupResult } from "@/lib/beach/layout";

/** Checks the role itself: the page guard is not a security boundary. */
export async function setupBeachAction(
  input: unknown,
): Promise<SetupResult | { ok: false; error: "forbidden" }> {
  const actor = await readCurrentUser();
  if (actor?.role !== "admin") return { ok: false, error: "forbidden" };
  const result = await setupBeach(getDb(), input);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
