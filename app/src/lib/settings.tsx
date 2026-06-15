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

import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n/locales";

/** The Spec slot template (DEC-042/043/050). `{{title}}` / `{{id}}` are
 * substituted at issue-creation time. There's one per UI locale (DEC-108): an
 * unset `settings.specTemplate` follows the active locale; a non-empty value is
 * the user's explicit override (kept across locale switches).
 *
 * DEC-050/071 (evals 層A): the acceptance criteria are the Definition of Done —
 * written BEFORE Implement, in observable/checkable statements. After Implement,
 * Bezier auto-collects evidence (changed scope, sensitive areas) into the Spec,
 * and the MAKER checks each line against that evidence (Bezier does not score).
 * The Clarify (kickoff) answers condense into "acceptance criteria / out of scope". */
export const DEFAULT_SPEC_TEMPLATE_EN = `---
issue: {{id}}
---
# {{title}} — Spec

## Why
<!-- Background, the problem, why now -->

## What
<!-- What you're building. 1–3 lines, the core -->

## Acceptance criteria (= definition of done / decide before Implement)
<!-- Write observable, checkable statements. After Implement, the maker checks each line against the evidence (the Spec tab's "Verify"). -->
- [ ]
- [ ]

## Out of scope
<!-- Boundaries so Implement doesn't sprawl -->
-

## Open questions
<!-- Points to settle in Clarify (the kickoff check) -->
-
`;

export const DEFAULT_SPEC_TEMPLATE_JA = `---
issue: {{id}}
---
# {{title}} — Spec

## なぜ
<!-- 背景・課題・なぜ今やるのか -->

## 何を
<!-- 何を作るのか。1〜3 行で芯を -->

## 受入基準（= 完成の定義 / Implement の前に決める）
<!-- 観察可能・チェック可能な文で書く。Implement 後、証拠を見て maker が各行をチェックする（Spec タブの「検証」）。 -->
- [ ]
- [ ]

## やらないこと
<!-- スコープ外。Implement が広がらないための境界 -->
-

## 未解決
<!-- Clarify（着手時の確認）で詰める論点 -->
-
`;

/** The built-in Spec template for a locale (the default when not overridden). */
export function specTemplateFor(locale: Locale): string {
  return locale === "ja" ? DEFAULT_SPEC_TEMPLATE_JA : DEFAULT_SPEC_TEMPLATE_EN;
}

/** Every built-in default, used to detect "this is just a default, not a real
 * override" when migrating older settings. */
const BUILTIN_SPEC_TEMPLATES = [DEFAULT_SPEC_TEMPLATE_EN, DEFAULT_SPEC_TEMPLATE_JA];

export type ThemePref = "light" | "dark" | "system";

/**
 * A named publish "account/connection" (DEC-098): which hosting identity a repo
 * deploys under. NOW: a Vercel team `scope` (uses the logged-in `vercel`
 * session — multiple TEAMS under one login). Separate-login accounts via a
 * Keychain token are a later slice. Per-repo binding (repoConnections) prevents
 * accidentally deploying one client's work under another's account.
 */
export interface PublishConnection {
  id: string;
  label: string;
  /** Vercel team/scope slug used as `vercel deploy --scope <scope>`. */
  scope: string;
}

/** Which sections a shared journey page includes (DEC-094, per-share toggle). */
export interface JourneyLayers {
  app: boolean;
  spec: boolean;
  design: boolean;
  impl: boolean;
}

// Safe default (DEC-101): the "見せる成果物" pair on, the optional/internal pair
// off — so a first share never accidentally includes the code/commit record.
export const DEFAULT_JOURNEY_LAYERS: JourneyLayers = {
  app: true,
  design: true,
  spec: false,
  impl: false,
};

export interface Settings {
  /** UI display language (⑥ / DEC-107). Default en; ja ships alongside. */
  locale: Locale;
  /** Spec slot template override with {{title}} / {{id}} placeholders. Empty =
   * follow the locale's built-in default (DEC-108); non-empty = explicit override. */
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
  /** Auto-commit a checkpoint before each agent turn (DEC-087/090). */
  autoCheckpoint: boolean;
  /**
   * Protect the base branch (DEC-099): when on, the local "Merge to main"
   * action is hidden — finalizing must go through a PR. Mirrors GitHub branch
   * protection; a team-grade guardrail. Default off (solo makers merge directly,
   * always behind a confirm). The merge CONFIRM is unconditional regardless.
   */
  protectMain: boolean;
  /** Named publish accounts (DEC-098). */
  publishConnections: PublishConnection[];
  /** Connection id used when a repo has no explicit binding. */
  defaultConnectionId: string;
  /** Per-repo binding: repo path → connection id (prevents cross-account deploy). */
  repoConnections: Record<string, string>;
  /** Which sections a shared journey includes (DEC-094). */
  journeyLayers: JourneyLayers;
}

export const DEFAULT_CONNECTIONS: PublishConnection[] = [
  { id: "default", label: "個人 (bezier)", scope: "bezier" },
];

export const DEFAULT_SETTINGS: Settings = {
  locale: DEFAULT_LOCALE,
  specTemplate: "", // "" = follow the active locale's built-in template (DEC-108)
  theme: "system",
  maxPreviews: 3,
  previewIdleMinutes: 10,
  defaultAgentId: "",
  trashTtlDays: 30,
  autoCheckpoint: true,
  protectMain: false,
  publishConnections: DEFAULT_CONNECTIONS,
  defaultConnectionId: "default",
  repoConnections: {},
  journeyLayers: DEFAULT_JOURNEY_LAYERS,
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
    locale: isLocale(o.locale) ? o.locale : DEFAULT_LOCALE,
    // Empty = follow the locale default (DEC-108). Migrate older settings that
    // stored a built-in template verbatim back to "" so they follow the locale.
    specTemplate:
      typeof o.specTemplate === "string" &&
      o.specTemplate.trim() &&
      !BUILTIN_SPEC_TEMPLATES.includes(o.specTemplate)
        ? o.specTemplate
        : "",
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
    autoCheckpoint:
      typeof o.autoCheckpoint === "boolean"
        ? o.autoCheckpoint
        : DEFAULT_SETTINGS.autoCheckpoint,
    protectMain:
      typeof o.protectMain === "boolean"
        ? o.protectMain
        : DEFAULT_SETTINGS.protectMain,
    publishConnections: coerceConnections(o.publishConnections),
    defaultConnectionId:
      typeof o.defaultConnectionId === "string" && o.defaultConnectionId
        ? o.defaultConnectionId
        : "default",
    repoConnections: coerceRepoConnections(o.repoConnections),
    journeyLayers: coerceJourneyLayers(o.journeyLayers),
  };
}

function coerceJourneyLayers(raw: unknown): JourneyLayers {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const b = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  return {
    app: b(o.app, DEFAULT_JOURNEY_LAYERS.app),
    spec: b(o.spec, DEFAULT_JOURNEY_LAYERS.spec),
    design: b(o.design, DEFAULT_JOURNEY_LAYERS.design),
    impl: b(o.impl, DEFAULT_JOURNEY_LAYERS.impl),
  };
}

function coerceConnections(raw: unknown): PublishConnection[] {
  if (!Array.isArray(raw)) return DEFAULT_CONNECTIONS.map((c) => ({ ...c }));
  const out: PublishConnection[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    if (
      typeof c.id === "string" &&
      c.id &&
      typeof c.label === "string" &&
      typeof c.scope === "string"
    ) {
      out.push({ id: c.id, label: c.label, scope: c.scope });
    }
  }
  return out.length > 0 ? out : DEFAULT_CONNECTIONS.map((c) => ({ ...c }));
}

function coerceRepoConnections(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" && v) out[k] = v;
  }
  return out;
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

/** The effective Spec template (DEC-108): the user's override if set, else the
 * active locale's built-in default. Used at issue creation. */
export function getSpecTemplate(): string {
  return current.specTemplate.trim() ? current.specTemplate : specTemplateFor(current.locale);
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
