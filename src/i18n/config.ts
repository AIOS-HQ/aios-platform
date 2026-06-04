/**
 * Localization configuration for AIOS.
 *
 * Global-first is an AIOS principle: the platform ships English + Spanish from
 * day one, and is structured so Portuguese, French, German, and Italian can be
 * added later by dropping a new `messages/<locale>.json` file and extending the
 * `locales` array below — no component changes required.
 */
export const locales = ["en", "es"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

/** Human-readable names shown in the language switcher. */
export const localeNames: Record<Locale, string> = {
  en: "English",
  es: "Español",
};

/** Cookie that persists the visitor's chosen locale across requests. */
export const LOCALE_COOKIE = "AIOS_LOCALE";

export function isLocale(value: string | undefined | null): value is Locale {
  return Boolean(value) && (locales as readonly string[]).includes(value as string);
}
