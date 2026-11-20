"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { resolveActor } from "@/lib/auth/acting";
import { readCurrentUser } from "@/lib/auth/session";
import * as bookings from "@/lib/booking/bookings";
import type { CancelResult, CreateResult } from "@/lib/booking/bookings";
import * as checkIns from "@/lib/booking/check-in";
import type {
  CheckInResult,
  HoldResult,
  RestoreNoShowResult,
  UncheckResult,
} from "@/lib/booking/check-in";
import { moveBooking, type MoveResult } from "@/lib/booking/move";
import * as passes from "@/lib/booking/passes";
import type { DaysResult, EndPassResult } from "@/lib/booking/passes";
import { suggestQuickBook, type QuickSuggestResult } from "@/lib/booking/quick-book";
import { undoEntry, type UndoResult } from "@/lib/booking/undo";

type Forbidden = { ok: false; error: "forbidden" };
/** A communal tablet has no fresh "who is acting" choice yet (ADR 0024): ask, then retry. */
type NeedsActor = { ok: false; error: "needsActor" };
type Refused = Forbidden | NeedsActor;

/** Who the action is recorded under: the session's user, or the person chosen on a tablet. */
async function actorFor(): Promise<{ ok: true; actorId: string } | Refused> {
  const user = await readCurrentUser();
  if (!user) return { ok: false, error: "forbidden" };
  return resolveActor(getDb(), user);
}

/** Any logged-in staff member may book. Each action checks the session itself. */
export async function createBookingAction(input: unknown): Promise<CreateResult | Refused> {
  const actor = await actorFor();
  if (!actor.ok) return actor;
  const result = await bookings.createBooking(getDb(), actor.actorId, input);
  if (result.ok) revalidatePath("/");
  return result;
}

export async function cancelBookingAction(input: unknown): Promise<CancelResult | Refused> {
  const actor = await actorFor();
  if (!actor.ok) return actor;
  const result = await bookings.cancelBooking(getDb(), actor.actorId, input);
  if (result.ok) revalidatePath("/");
  return result;
}

/** Any staff member may move a booking, like cancelling it; the move can be undone. */
export async function moveBookingAction(input: unknown): Promise<MoveResult | Refused> {
  const actor = await actorFor();
  if (!actor.ok) return actor;
  const result = await moveBooking(getDb(), actor.actorId, input);
  if (result.ok) revalidatePath("/");
  return result;
}

/** Staff sell season passes at the desk, like any other booking. */
export async function createSeasonPassAction(input: unknown): Promise<CreateResult | Refused> {
  const actor = await actorFor();
  if (!actor.ok) return actor;
  const result = await passes.createSeasonPass(getDb(), actor.actorId, input);
  if (result.ok) revalidatePath("/");
  return result;
}

export async function releaseDaysAction(input: unknown): Promise<DaysResult | Refused> {
  const actor = await actorFor();
  if (!actor.ok) return actor;
  const result = await passes.releaseDays(getDb(), actor.actorId, input);
  if (result.ok) revalidatePath("/");
  return result;
}

export async function restoreDaysAction(input: unknown): Promise<DaysResult | Refused> {
  const actor = await actorFor();
  if (!actor.ok) return actor;
  const result = await passes.restoreDays(getDb(), actor.actorId, input);
  if (result.ok) revalidatePath("/");
  return result;
}

export async function endSeasonPassAction(input: unknown): Promise<EndPassResult | Refused> {
  const actor = await actorFor();
  if (!actor.ok) return actor;
  const result = await passes.endSeasonPass(getDb(), actor.actorId, input);
  if (result.ok) revalidatePath("/");
  return result;
}

/** Refused because another tablet or the hold job got there first: show the map as it is now. */
function refreshes(error: string): boolean {
  return ["unchanged", "noShow", "released", "taken"].includes(error);
}

/** Any staff member checks arrivals in, for today only (ADR 0015). */
export async function checkInAction(input: unknown): Promise<CheckInResult | Refused> {
  const actor = await actorFor();
  if (!actor.ok) return actor;
  const result = await checkIns.checkIn(getDb(), actor.actorId, input);
  if (result.ok || refreshes(result.error)) revalidatePath("/");
  return result;
}

export async function uncheckAction(input: unknown): Promise<UncheckResult | Refused> {
  const actor = await actorFor();
  if (!actor.ok) return actor;
  const result = await checkIns.uncheck(getDb(), actor.actorId, input);
  if (result.ok || refreshes(result.error)) revalidatePath("/");
  return result;
}

export async function restoreNoShowAction(input: unknown): Promise<RestoreNoShowResult | Refused> {
  const actor = await actorFor();
  if (!actor.ok) return actor;
  const result = await checkIns.restoreNoShow(getDb(), actor.actorId, input);
  if (result.ok || refreshes(result.error)) revalidatePath("/");
  return result;
}

export async function setHoldAction(input: unknown): Promise<HoldResult | Refused> {
  const actor = await actorFor();
  if (!actor.ok) return actor;
  const result = await checkIns.setHold(getDb(), actor.actorId, input);
  if (result.ok || refreshes(result.error)) revalidatePath("/");
  return result;
}

/** Read-only: suggests free umbrellas. Staff confirm with `createBookingAction` or a pass. */
export async function suggestQuickBookAction(
  input: unknown,
): Promise<QuickSuggestResult | Forbidden> {
  const user = await readCurrentUser();
  if (!user) return { ok: false, error: "forbidden" };
  return suggestQuickBook(getDb(), input);
}

/** Who may undo what is decided in `undoEntry` from the session's role (ADR 0013). */
export async function undoAction(input: unknown): Promise<UndoResult | Refused> {
  const user = await readCurrentUser();
  if (!user) return { ok: false, error: "forbidden" };
  const actor = await resolveActor(getDb(), user);
  if (!actor.ok) return actor;
  const result = await undoEntry(getDb(), { id: actor.actorId, role: user.role }, input);
  if (result.ok) revalidatePath("/");
  return result;
}
