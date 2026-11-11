"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { writeLocaleCookie } from "@/i18n/locale-cookie";
import { getAuth } from "./auth";
import { getCurrentUser } from "./session";

/** Ends the session. The locale cookie keeps the user's language on the login page. */
export async function logout(): Promise<never> {
  const user = await getCurrentUser();
  if (user) {
    await writeLocaleCookie(user.locale);
    await getAuth().api.signOut({ headers: await headers() });
  }
  redirect("/login");
}
