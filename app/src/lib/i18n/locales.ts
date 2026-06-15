// Supported UI locales (⑥ / DEC-107). English is the DEFAULT; Japanese ships
// alongside it — the app's strings were authored in JA, so the `ja` catalog is
// complete from day one (we extract each existing JA string and write its EN
// twin). Adding a language later = a new catalog file (typed to `Messages`) +
// one entry here.
//
// This file has NO dependencies (no React, no settings) so both the settings
// store and the i18n runtime can import the `Locale` type without a cycle.

export const LOCALES = [
  { code: "en", label: "English" },
  { code: "ja", label: "日本語" },
] as const;

export type Locale = (typeof LOCALES)[number]["code"];

/** First-run / fallback locale. CEO: ship English first (⑥). */
export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && LOCALES.some((l) => l.code === v);
}
