"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { readCurrentUser } from "@/lib/auth/session";
import * as bookings from "@/lib/booking/bookings";
import type { CancelResult, CreateResult } from "@/lib/booking/bookings";
import * as passes from "@/lib/booking/passes";
import type { DaysResult } from "@/lib/booking/passes";

type Forbidden = { ok: false; error: "forbidden" };

/** Any logged-in staff member may book. Each action checks the session itself. */
export async function createBookingAction(input: unknown): Promise<CreateResult | Forbidden> {
  const user = await readCurrentUser();
  if (!user) return { ok: false, error: "forbidden" };
  const result = await bookings.createBooking(getDb(), user.id, input);
  if (result.ok) revalidatePath("/");
  return result;
}

export async function cancelBookingAction(input: unknown): Promise<CancelResult | Forbidden> {
  const user = await readCurrentUser();
  if (!user) return { ok: false, error: "forbidden" };
  const result = await bookings.cancelBooking(getDb(), user.id, input);
  if (result.ok) revalidatePath("/");
  return result;
}

/** Staff sell season passes at the desk, like any other booking. */
export async function createSeasonPassAction(input: unknown): Promise<CreateResult | Forbidden> {
  const user = await readCurrentUser();
  if (!user) return { ok: false, error: "forbidden" };
  const result = await passes.createSeasonPass(getDb(), user.id, input);
  if (result.ok) revalidatePath("/");
  return result;
}

export async function releaseDaysAction(input: unknown): Promise<DaysResult | Forbidden> {
  const user = await readCurrentUser();
  if (!user) return { ok: false, error: "forbidden" };
  const result = await passes.releaseDays(getDb(), input);
  if (result.ok) revalidatePath("/");
  return result;
}

export async function restoreDaysAction(input: unknown): Promise<DaysResult | Forbidden> {
  const user = await readCurrentUser();
  if (!user) return { ok: false, error: "forbidden" };
  const result = await passes.restoreDays(getDb(), input);
  if (result.ok) revalidatePath("/");
  return result;
}
