"use client";

// i18n runtime (⑥ / DEC-107). A tiny, dependency-free, fully-typed translator:
//
//   const { t } = useI18n();
//   t("history.restoreHere")                 // → "Roll back here" / "ここに戻す"
//   t("history.nStatesAgo", { n: 3 })        // {placeholders} filled
//
// - Keys autocomplete and are compile-checked (MsgKey = every leaf path in en).
// - The active locale comes from settings (useSettingsValue), so every consumer
//   re-renders when the language changes — no provider, no context plumbing.
// - Missing a key in the active locale falls back to English, then to the raw
//   key (so nothing ever renders blank during an in-progress migration).
//
// For modules OUTSIDE React (that already read getSettings()), use tt(key, ...).

import * as React from "react";

import { getSettings, useSettingsValue } from "@/lib/settings";
import { en, type Messages } from "./en";
import { ja } from "./ja";
import { DEFAULT_LOCALE, type Locale } from "./locales";

const CATALOGS: Record<Locale, Messages> = { en, ja };

// --- key typing -----------------------------------------------------------
// MsgKey = the union of every dotted leaf path in the catalog ("common.save",
// "history.nStatesAgo", …). Gives autocomplete + a compile error on a typo.
type Join<K, P> = K extends string ? (P extends string ? `${K}.${P}` : never) : never;
type Leaves<T> = T extends object
  ? { [K in keyof T & string]: T[K] extends string ? K : Join<K, Leaves<T[K]>> }[keyof T & string]
  : never;
export type MsgKey = Leaves<Messages>;

export type MsgParams = Record<string, string | number>;

// --- resolution -----------------------------------------------------------
function resolve(catalog: Messages, key: string): string | undefined {
  let cur: unknown = catalog;
  for (const part of key.split(".")) {
    if (cur && typeof cur === "object" && part in (cur as object)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof cur === "string" ? cur : undefined;
}

function interpolate(tmpl: string, params?: MsgParams): string {
  if (!params) return tmpl;
  return tmpl.replace(/\{(\w+)\}/g, (m, k: string) =>
    Object.prototype.hasOwnProperty.call(params, k) ? String(params[k]) : m,
  );
}

/** Translate in an explicit locale (the shared core; falls back en → key). */
export function translate(locale: Locale, key: MsgKey, params?: MsgParams): string {
  const hit = resolve(CATALOGS[locale] ?? CATALOGS[DEFAULT_LOCALE], key) ?? resolve(en, key);
  return interpolate(hit ?? key, params);
}

/** Non-React translate for module scope — reads the live settings snapshot. */
export function tt(key: MsgKey, params?: MsgParams): string {
  return translate(getSettings().locale, key, params);
}

export type TFn = (key: MsgKey, params?: MsgParams) => string;

/** The React hook: returns the active locale and a memoized `t`. */
export function useI18n(): { locale: Locale; t: TFn } {
  const locale = useSettingsValue().locale;
  const t = React.useCallback<TFn>((key, params) => translate(locale, key, params), [locale]);
  return { locale, t };
}

/** Convenience when you only need `t`. */
export function useT(): TFn {
  return useI18n().t;
}

export { LOCALES, DEFAULT_LOCALE } from "./locales";
export type { Locale } from "./locales";
