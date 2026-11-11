import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { LOCALE_COOKIE, timeZone } from "./config";
import { resolveLocale } from "./resolve-locale";

export default getRequestConfig(async () => {
  const store = await cookies();
  const user = await getCurrentUser();
  const locale = resolveLocale({ user: user?.locale, cookie: store.get(LOCALE_COOKIE)?.value });
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return { locale, messages, timeZone };
});
