import { headers } from "next/headers";
import { hit, type Limit } from "@/lib/rate-limit";
import type { CurrentUser } from "./session";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

// End-to-end tests run many specs at once under one admin account: they raise every limit.
const multiplier = Math.max(1, Number(process.env.RATE_LIMIT_MULTIPLIER) || 1);
const scaled = (max: number, windowMs: number): Limit => ({ max: max * multiplier, windowMs });

/**
 * Searches return names and phones. Per minute: enough for a busy desk. Per day: far above a
 * day at the desk, well below what copying the customer list by name prefixes takes.
 */
export const SEARCH_LIMITS: Limit[] = [scaled(30, MINUTE), scaled(400, DAY)];
/** Booking actions: far above a rush at the desk, a brake on a runaway or scripted client. */
export const ACTION_LIMITS: Limit[] = [scaled(60, MINUTE)];

type Who = Pick<CurrentUser, "id" | "communal" | "sessionId">;

/**
 * Who a limit counts: the account, or each tablet session of a communal account (they share
 * one account, ADR 0027). Also the client address, so new sessions don't reset the count.
 */
function limitKeys(scope: string, user: Who, ip: string | null): string[] {
  const who = user.communal ? `session:${user.sessionId}` : `user:${user.id}`;
  return ip ? [`${scope}:${who}`, `${scope}:ip:${ip}`] : [`${scope}:${who}`];
}

/** False when this request is over a limit. Caddy sets X-Real-IP (ADR 0008). */
export async function withinLimit(scope: "search" | "action", user: Who): Promise<boolean> {
  const ip = (await headers()).get("x-real-ip");
  const limits = scope === "search" ? SEARCH_LIMITS : ACTION_LIMITS;
  let allowed = true;
  for (const limit of limits) {
    const keys = limitKeys(`${scope}:${limit.windowMs}`, user, ip);
    if (!hit(keys, limit)) allowed = false;
  }
  return allowed;
}
