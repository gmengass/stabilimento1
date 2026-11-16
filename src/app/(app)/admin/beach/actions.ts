"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { readCurrentUser } from "@/lib/auth/session";
import { writeEntry } from "@/lib/booking/audit";
import * as edit from "@/lib/beach/edit";
import type { EditResult } from "@/lib/beach/edit";
import { setupBeach, type SetupResult } from "@/lib/beach/layout";

type Forbidden = { ok: false; error: "forbidden" };

/**
 * Every beach action checks the role itself: the page guard is not a security boundary. A change
 * that worked shows in the activity stream; it can't be undone there (ADR 0013).
 */
async function asAdmin<R extends { ok: boolean }>(
  what: string,
  run: () => Promise<R>,
): Promise<R | Forbidden> {
  const actor = await readCurrentUser();
  if (actor?.role !== "admin") return { ok: false, error: "forbidden" };
  const result = await run();
  if (!result.ok) return result;
  await writeEntry(getDb(), { userId: actor.id, action: "beach", detail: { what } });
  revalidatePath("/", "layout");
  return result;
}

export async function setupBeachAction(input: unknown): Promise<SetupResult | Forbidden> {
  return asAdmin("setupBeach", () => setupBeach(getDb(), input));
}

export async function renameVenueAction(input: unknown): Promise<EditResult | Forbidden> {
  return asAdmin("renameVenue", () => edit.renameVenue(getDb(), input));
}

export async function addLineAction(input: unknown): Promise<EditResult | Forbidden> {
  return asAdmin("addLine", () => edit.addLine(getDb(), input));
}

export async function addUmbrellasAction(input: unknown): Promise<EditResult | Forbidden> {
  return asAdmin("addUmbrellas", () => edit.addUmbrellas(getDb(), input));
}

export async function removeLastLineAction(input: unknown): Promise<EditResult | Forbidden> {
  return asAdmin("removeLastLine", () => edit.removeLastLine(getDb(), input));
}

export async function updateSpotAction(input: unknown): Promise<EditResult | Forbidden> {
  return asAdmin("updateSpot", () => edit.updateSpot(getDb(), input));
}

export async function removeSpotAction(input: unknown): Promise<EditResult | Forbidden> {
  return asAdmin("removeSpot", () => edit.removeSpot(getDb(), input));
}

export async function addAreaAction(input: unknown): Promise<edit.AddAreaResult | Forbidden> {
  return asAdmin("addArea", () => edit.addArea(getDb(), input));
}

export async function renameAreaAction(input: unknown): Promise<EditResult | Forbidden> {
  return asAdmin("renameArea", () => edit.renameArea(getDb(), input));
}

export async function removeAreaAction(input: unknown): Promise<EditResult | Forbidden> {
  return asAdmin("removeArea", () => edit.removeArea(getDb(), input));
}
