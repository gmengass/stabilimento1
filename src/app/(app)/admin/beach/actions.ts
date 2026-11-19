"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { readCurrentUser } from "@/lib/auth/session";
import { writeEntry, type Detail } from "@/lib/booking/audit";
import * as edit from "@/lib/beach/edit";
import type { EditResult } from "@/lib/beach/edit";
import { setupBeach, type SetupResult } from "@/lib/beach/layout";

type Forbidden = { ok: false; error: "forbidden" };

/** Best effort: the change is already saved, so a failed log write must not report it as failed. */
async function logChange(userId: string, detail: Detail) {
  try {
    await writeEntry(getDb(), { userId, action: "beach", detail });
  } catch (error) {
    console.error("activity log write failed", error);
  }
}

/**
 * Every beach action checks the role itself: the page guard is not a security boundary. A change
 * that worked shows in the activity stream; it can't be undone there (ADR 0013).
 */
async function asAdmin<R extends { ok: boolean }>(
  what: string,
  run: () => Promise<R>,
  detailOf: (result: Extract<R, { ok: true }>) => Detail = () => ({}),
): Promise<R | Forbidden> {
  const actor = await readCurrentUser();
  if (actor?.role !== "admin") return { ok: false, error: "forbidden" };
  const result = await run();
  if (!result.ok) return result;
  await logChange(actor.id, { what, ...detailOf(result as Extract<R, { ok: true }>) });
  revalidatePath("/", "layout");
  return result;
}

export async function setupBeachAction(input: unknown): Promise<SetupResult | Forbidden> {
  return asAdmin("setupBeach", () => setupBeach(getDb(), input));
}

export async function renameVenueAction(input: unknown): Promise<EditResult | Forbidden> {
  return asAdmin("renameVenue", () => edit.renameVenue(getDb(), input));
}

/** Logged with the old and new time: the job frees umbrellas by it (ADR 0018). */
export async function setDefaultHoldAction(
  input: unknown,
): Promise<edit.SetDefaultHoldResult | Forbidden> {
  return asAdmin(
    "setDefaultHold",
    () => edit.setDefaultHold(getDb(), input),
    ({ from, to }) => ({ from, to }),
  );
}

/** Logged with the old and new numbers: the counts and booking warnings use them (ADR 0021). */
export async function setStockAction(input: unknown): Promise<edit.SetStockResult | Forbidden> {
  return asAdmin(
    "setStock",
    () => edit.setStock(getDb(), input),
    // The log holds strings and numbers: "" stands for "not tracked".
    ({ from, to }) => ({
      fromSunbeds: from.sunbedStock ?? "",
      toSunbeds: to.sunbedStock ?? "",
      fromDeckchairs: from.deckchairStock ?? "",
      toDeckchairs: to.deckchairStock ?? "",
    }),
  );
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
