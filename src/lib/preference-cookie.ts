import { cookies } from "next/headers";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Writes a one-year display preference cookie. Only callable from a Server Action or Route Handler. */
export async function writePreferenceCookie(name: string, value: string): Promise<void> {
  const store = await cookies();
  store.set(name, value, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    maxAge: ONE_YEAR_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
}
