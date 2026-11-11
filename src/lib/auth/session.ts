import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { defaultLocale, isLocale, type Locale } from "@/i18n/config";
import { getAuth } from "./auth";
import type { Role } from "./rules";

export interface CurrentUser {
  id: string;
  username: string;
  name: string;
  role: Role;
  locale: Locale;
}

/** Reads the session from the database. Banned users have no session. */
export async function readCurrentUser(): Promise<CurrentUser | null> {
  // Read the request first: at build time this ends prerendering before auth needs env vars.
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) return null;
  const { id, username, name, role, locale } = session.user;
  return {
    id,
    username: username ?? "",
    name,
    role: role === "admin" ? "admin" : "staff",
    locale: isLocale(locale) ? locale : defaultLocale,
  };
}

/**
 * The logged-in user, read once per render. Server Actions that change the user use
 * `readCurrentUser` so the re-render after them doesn't reuse a stale value.
 */
export const getCurrentUser = cache(readCurrentUser);

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}
