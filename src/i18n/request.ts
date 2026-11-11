import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { LOCALE_COOKIE, VENUE_TIME_ZONE } from "./config";
import { getUserLocalePreference, resolveLocale } from "./locale";

export default getRequestConfig(async () => {
  const locale = resolveLocale({
    userPreference: await getUserLocalePreference(),
    cookie: (await cookies()).get(LOCALE_COOKIE)?.value,
  });
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return { locale, messages, timeZone: VENUE_TIME_ZONE };
});
