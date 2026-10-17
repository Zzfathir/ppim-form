export const locales = ["en", "id"] as const;
export type Locale = (typeof locales)[number];

/** English is the default (owner decision, see DECISIONS.md); Indonesian is the alternative. */
export const defaultLocale: Locale = "en";

/** The locale is kept in a cookie, so URLs (e.g. share links /f/{slug}) carry no locale prefix. */
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}
