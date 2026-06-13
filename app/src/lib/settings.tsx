"use client";

// App settings (DEC-043). A single JSON blob persisted to localStorage, exposed
// two ways:
//   - React: `useSettings()` / `useSettingsValue()` via useSyncExternalStore, so
//     the settings page + any consumer re-render on change.
//   - Non-React modules (issues.ts, use-preview-server.ts) read the synchronous
//     `getSettings()` snapshot — these run outside React but still need the live
//     value (the Spec template, the preview caps, the trash TTL).
//
// Same module-store shape as workspace-root.tsx: a mutable snapshot + a listener
// set, SSR-safe (server snapshot = defaults). No Date.now in the store itself.

import * as React from "react";

/** The Spec slot template (DEC-042/043/050). `{{title}}` / `{{id}}` are
 * substituted at issue-creation time. Kept here so the settings page can reset
 * to it.
 *
 * DEC-050 (evals 層A): 受入基準は「完成の定義（Definition of Done）」として
 * **Build の前に・観察可能でチェック可能な文で** 書く。Build 後の Verify が
 * この一つひとつを PASS/FAIL で採点する。Clarify（着手時の確認対話）の答えは
 * この「受入基準 / やらないこと」に凝縮される。 */
export const DEFAULT_SPEC_TEMPLATE = `---
issue: {{id}}
---
# {{title}} — Spec

## なぜ
<!-- 背景・課題・なぜ今やるのか -->

## 何を
<!-- 何を作るのか。1〜3 行で芯を -->

## 受入基準（= 完成の定義 / Build の前に決める）
<!-- 観察可能・チェック可能な文で書く。Build 後に Verify がこの一行ずつを採点する。 -->
- [ ]
- [ ]

## やらないこと
<!-- スコープ外。Build が広がらないための境界 -->
-

## 未解決
<!-- Clarify（着手時の確認）で詰める論点 -->
-
`;

export type ThemePref = "light" | "dark" | "system";

export interface Settings {
  /** Spec slot template with {{title}} / {{id}} placeholders. */
  specTemplate: string;
  /** App theme: light / dark / follow OS. */
  theme: ThemePref;
  /** Max concurrent preview dev servers (DEC-040 cap). */
  maxPreviews: number;
  /** Stop a preview not viewed for this many minutes (DEC-040 idle). */
  previewIdleMinutes: number;
  /** Preferred agent id ("" = auto: first available). */
  defaultAgentId: string;
  /** Days a trashed issue is kept before auto-purge (DEC-020). */
  trashTtlDays: number;
}

export const DEFAULT_SETTINGS: Settings = {
  specTemplate: DEFAULT_SPEC_TEMPLATE,
  theme: "system",
  maxPreviews: 3,
  previewIdleMinutes: 10,
  defaultAgentId: "",
  trashTtlDays: 30,
};

const STORAGE_KEY = "bezier:settings";
/** Mirror of `theme` written separately so the pre-paint THEME_SYNC script (in
 * layout.tsx) can read it without parsing the whole settings blob. */
const THEME_KEY = "bezier:theme";

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function coerce(raw: unknown): Settings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS };
  const o = raw as Record<string, unknown>;
  const theme: ThemePref =
    o.theme === "light" || o.theme === "dark" || o.theme === "system"
      ? o.theme
      : DEFAULT_SETTINGS.theme;
  return {
    specTemplate:
      typeof o.specTemplate === "string" && o.specTemplate.trim()
        ? o.specTemplate
        : DEFAULT_SPEC_TEMPLATE,
    theme,
    maxPreviews: clampInt(o.maxPreviews, 1, 8, DEFAULT_SETTINGS.maxPreviews),
    previewIdleMinutes: clampInt(
      o.previewIdleMinutes,
      1,
      120,
      DEFAULT_SETTINGS.previewIdleMinutes,
    ),
    defaultAgentId:
      typeof o.defaultAgentId === "string" ? o.defaultAgentId : "",
    trashTtlDays: clampInt(o.trashTtlDays, 1, 365, DEFAULT_SETTINGS.trashTtlDays),
  };
}

// --- module store ---------------------------------------------------------

function load(): Settings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? coerce(JSON.parse(raw)) : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

let current: Settings = load();

const listeners = new Set<() => void>();
function notify(): void {
  for (const l of listeners) l();
}
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Synchronous snapshot for non-React consumers (issues.ts, preview hook). */
export function getSettings(): Settings {
  return current;
}

/** Resolve the theme preference to an effective "dark" boolean (system → OS). */
export function resolveDark(theme: ThemePref = current.theme): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  return true;
}

/** Apply the resolved theme to <html> (toggles `.dark`, the class-based system). */
function applyTheme(theme: ThemePref): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", resolveDark(theme));
}

export function setSettings(patch: Partial<Settings>): void {
  current = coerce({ ...current, ...patch });
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    window.localStorage.setItem(THEME_KEY, current.theme);
  } catch {
    /* localStorage unavailable — keep in-memory */
  }
  if (patch.theme !== undefined) applyTheme(current.theme);
  notify();
}

export function resetSettings(): void {
  setSettings({ ...DEFAULT_SETTINGS });
}

// --- React bindings -------------------------------------------------------

function getSnapshot(): Settings {
  return current;
}
function getServerSnapshot(): Settings {
  return DEFAULT_SETTINGS;
}

/** Read the live settings value (re-renders on change). */
export function useSettingsValue(): Settings {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Settings value + an updater, for the settings page. */
export function useSettings(): {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
} {
  const settings = useSettingsValue();
  return { settings, update: setSettings, reset: resetSettings };
}

/**
 * Mount-once theme keeper: applies the saved theme and, when on "system", live-
 * updates as the OS preference flips. Rendered high in the tree (layout) so the
 * `.dark` class always reflects the setting after hydration. The pre-paint
 * THEME_SYNC inline script handles the very first frame (no flash).
 */
export function ThemeKeeper(): null {
  React.useEffect(() => {
    applyTheme(current.theme);
    const m = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!m) return;
    const onOS = () => {
      if (current.theme === "system") applyTheme("system");
    };
    m.addEventListener("change", onOS);
    return () => m.removeEventListener("change", onOS);
  }, []);
  return null;
}
