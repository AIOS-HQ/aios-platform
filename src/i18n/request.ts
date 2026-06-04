import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { defaultLocale, isLocale, LOCALE_COOKIE } from "./config";

/**
 * Resolves the active locale per request.
 *
 * We use next-intl WITHOUT URL-based routing: the locale is read from a cookie
 * (set from the user's `preferred_language` setting or the language switcher),
 * falling back to the default. This keeps the folder structure clean and avoids
 * wrapping every route in a `[locale]` segment.
 */
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : defaultLocale;

  const messages = (await import(`../../messages/${locale}.json`)).default;

  return { locale, messages };
});
