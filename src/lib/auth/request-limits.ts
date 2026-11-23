import { headers } from "next/headers";
import { hit, type Limit } from "@/lib/rate-limit";
import type { CurrentUser } from "./session";

/** Searches return names and phones: enough for a busy desk, too slow to copy the customer list. */
export const SEARCH_LIMIT: Limit = { max: 30, windowMs: 60_000 };
/** Booking actions: far above a rush at the desk, a brake on a runaway or scripted client. */
export const ACTION_LIMIT: Limit = { max: 60, windowMs: 60_000 };

/**
 * Who a limit counts: the account, or each tablet session of a communal account (they share
 * one account, ADR 0025). Also the client address, so new sessions don't reset the count.
 */
function limitKeys(
  scope: string,
  user: Pick<CurrentUser, "id" | "communal" | "sessionId">,
  ip: string | null,
): string[] {
  const who = user.communal ? `session:${user.sessionId}` : `user:${user.id}`;
  return ip ? [`${scope}:${who}`, `${scope}:ip:${ip}`] : [`${scope}:${who}`];
}

/** False when this request is over the limit. Caddy sets X-Real-IP (ADR 0008). */
export async function withinLimit(
  scope: "search" | "action",
  user: Pick<CurrentUser, "id" | "communal" | "sessionId">,
): Promise<boolean> {
  const ip = (await headers()).get("x-real-ip");
  return hit(limitKeys(scope, user, ip), scope === "search" ? SEARCH_LIMIT : ACTION_LIMIT);
}
