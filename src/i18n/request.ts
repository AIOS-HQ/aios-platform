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
 *
 * Messages are composed from the base catalog plus feature-scoped catalogs
 * (the marketing `landing` namespace, the `marketingFeatures` catalog for the
 * Marketplace / Portable Company / Provisioning / Templates landing sections,
 * the `marketplace` Storefront catalog, the `pages` catalog — FAQ, Help Center
 * and onboarding — the `julius` Company Brain catalog, the `integrations`
 * Integration Center catalog, the `onboarding` Smart Onboarding catalog, the
 * `oversight` Harmony Oversight catalog, and the `ambassador` Business
 * Communications catalog), merged here so each surface can own its copy without
 * bloating the base file.
 */
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : defaultLocale;

  const base = (await import(`../../messages/${locale}.json`)).default;
  const landing = (await import(`../../messages/landing/${locale}.json`)).default;
  const marketingFeatures = (await import(`../../messages/marketing-features/${locale}.json`)).default;
  const marketplace = (await import(`../../messages/marketplace/${locale}.json`)).default;
  const pages = (await import(`../../messages/pages/${locale}.json`)).default;
  const julius = (await import(`../../messages/julius/${locale}.json`)).default;
  const integrations = (await import(`../../messages/integrations/${locale}.json`)).default;
  const onboarding = (await import(`../../messages/onboarding/${locale}.json`)).default;
  const oversight = (await import(`../../messages/oversight/${locale}.json`)).default;
  const ambassador = (await import(`../../messages/ambassador/${locale}.json`)).default;
  const pageOnboarding = pages.onboarding ?? {};
  const guidedOnboarding = onboarding.onboarding ?? {};

  return {
    locale,
    messages: {
      ...base,
      ...landing,
      ...marketingFeatures,
      ...marketplace,
      ...pages,
      ...julius,
      ...integrations,
      ...onboarding,
      onboarding: {
        ...pageOnboarding,
        ...guidedOnboarding,
      },
      ...oversight,
      ...ambassador,
    },
  };
});
