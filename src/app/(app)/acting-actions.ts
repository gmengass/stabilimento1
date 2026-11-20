"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { chooseActing, clearActing } from "@/lib/auth/acting";
import { readCurrentUser } from "@/lib/auth/session";

type Forbidden = { ok: false; error: "forbidden" };
type Invalid = { ok: false; error: "invalid" };

const chooseSchema = z.object({ staffId: z.string().min(1) });

/** Only a communal session has an acting person; the session id comes from the cookie. */
export async function chooseActingAction(
  input: unknown,
): Promise<{ ok: true } | Forbidden | Invalid> {
  const user = await readCurrentUser();
  if (!user?.communal) return { ok: false, error: "forbidden" };
  const parsed = chooseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const result = await chooseActing(getDb(), user.sessionId, parsed.data.staffId);
  if (result.ok) revalidatePath("/");
  return result;
}

/** "Not me": the next action asks who is acting again. */
export async function clearActingAction(): Promise<{ ok: true } | Forbidden> {
  const user = await readCurrentUser();
  if (!user?.communal) return { ok: false, error: "forbidden" };
  await clearActing(getDb(), user.sessionId);
  revalidatePath("/");
  return { ok: true };
}
