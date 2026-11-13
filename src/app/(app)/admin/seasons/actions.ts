"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { readCurrentUser } from "@/lib/auth/session";
import * as seasons from "@/lib/booking/seasons";
import type { SeasonResult } from "@/lib/booking/seasons";

type Forbidden = { ok: false; error: "forbidden" };

/** Every season action checks the role itself: the page guard is not a security boundary. */
async function asAdmin(run: () => Promise<SeasonResult>): Promise<SeasonResult | Forbidden> {
  const actor = await readCurrentUser();
  if (actor?.role !== "admin") return { ok: false, error: "forbidden" };
  const result = await run();
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function createSeasonAction(input: unknown): Promise<SeasonResult | Forbidden> {
  return asAdmin(() => seasons.createSeason(getDb(), input));
}

export async function updateSeasonAction(input: unknown): Promise<SeasonResult | Forbidden> {
  return asAdmin(() => seasons.updateSeason(getDb(), input));
}

export async function removeSeasonAction(input: unknown): Promise<SeasonResult | Forbidden> {
  return asAdmin(() => seasons.removeSeason(getDb(), input));
}
