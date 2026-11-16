"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { readCurrentUser } from "@/lib/auth/session";
import { writeEntry } from "@/lib/booking/audit";
import * as seasons from "@/lib/booking/seasons";
import type { SeasonResult } from "@/lib/booking/seasons";

type Forbidden = { ok: false; error: "forbidden" };

/**
 * Every season action checks the role itself: the page guard is not a security boundary. A change
 * that worked shows in the activity stream; it can't be undone there (ADR 0013).
 */
async function asAdmin(
  what: "create" | "update" | "remove",
  run: () => Promise<SeasonResult>,
): Promise<SeasonResult | Forbidden> {
  const actor = await readCurrentUser();
  if (actor?.role !== "admin") return { ok: false, error: "forbidden" };
  const result = await run();
  if (!result.ok) return result;
  await writeEntry(getDb(), { userId: actor.id, action: "season", detail: { what } });
  revalidatePath("/", "layout");
  return result;
}

export async function createSeasonAction(input: unknown): Promise<SeasonResult | Forbidden> {
  return asAdmin("create", () => seasons.createSeason(getDb(), input));
}

export async function updateSeasonAction(input: unknown): Promise<SeasonResult | Forbidden> {
  return asAdmin("update", () => seasons.updateSeason(getDb(), input));
}

export async function removeSeasonAction(input: unknown): Promise<SeasonResult | Forbidden> {
  return asAdmin("remove", () => seasons.removeSeason(getDb(), input));
}
