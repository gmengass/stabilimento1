"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getDb } from "@/db/client";
import { getAuth } from "@/lib/auth/auth";
import { readCurrentUser, type CurrentUser } from "@/lib/auth/session";
import * as staff from "@/lib/auth/staff";
import type { StaffResult } from "@/lib/auth/staff";

const PAGE = "/admin/staff";

type Operation = (headers: Headers, actor: CurrentUser) => Promise<StaffResult>;

/** Every staff action checks the role itself: the page guard is not a security boundary. */
async function asAdmin(operation: Operation): Promise<StaffResult> {
  const actor = await readCurrentUser();
  if (actor?.role !== "admin") return { ok: false, error: "forbidden" };
  const result = await operation(await headers(), actor);
  if (result.ok) revalidatePath(PAGE);
  return result;
}

export async function createStaffAction(input: unknown): Promise<StaffResult> {
  return asAdmin((h) => staff.createStaff(getAuth(), h, input));
}

export async function setDisabledAction(input: unknown): Promise<StaffResult> {
  return asAdmin((h, actor) => staff.setDisabled(getAuth(), getDb(), h, actor, input));
}

export async function resetPasswordAction(input: unknown): Promise<StaffResult> {
  return asAdmin((h) => staff.resetPassword(getAuth(), h, input));
}
