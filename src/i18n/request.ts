import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { LOCALE_COOKIE, timeZone } from "./config";
import { resolveLocale } from "./resolve-locale";

export default getRequestConfig(async () => {
  const store = await cookies();
  const locale = resolveLocale({ cookie: store.get(LOCALE_COOKIE)?.value });
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return { locale, messages, timeZone };
});
