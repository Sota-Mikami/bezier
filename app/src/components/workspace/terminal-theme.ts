// xterm.js themes that follow the app's light/dark scheme (DEC-033). The
// terminal used to be hardcoded dark (#0a0a0a) regardless of the app theme,
// which read as a black slab between the light sidebar and the light Spec/Design
// panes. These palettes blend with each mode. ANSI 16 are tuned for legibility
// on each background (Claude Code emits ANSI colors).

import type { ITheme } from "@xterm/xterm";
import { resolveDark } from "@/lib/settings";

export const DARK_TERMINAL: ITheme = {
  background: "#0a0a0a",
  foreground: "#e4e4e7", // zinc-200
  cursor: "#e4e4e7",
  cursorAccent: "#0a0a0a",
  selectionBackground: "#3f3f46", // zinc-700
  black: "#27272a",
  red: "#f87171",
  green: "#4ade80",
  yellow: "#fbbf24",
  blue: "#60a5fa",
  magenta: "#c084fc",
  cyan: "#22d3ee",
  white: "#e4e4e7",
  brightBlack: "#52525b",
  brightRed: "#fca5a5",
  brightGreen: "#86efac",
  brightYellow: "#fde047",
  brightBlue: "#93c5fd",
  brightMagenta: "#d8b4fe",
  brightCyan: "#67e8f9",
  brightWhite: "#fafafa",
};

export const LIGHT_TERMINAL: ITheme = {
  background: "#fbfbfb",
  foreground: "#27272a", // zinc-800
  cursor: "#27272a",
  cursorAccent: "#fbfbfb",
  selectionBackground: "#e4e4e7", // zinc-200
  black: "#3f3f46",
  red: "#dc2626",
  green: "#16a34a",
  yellow: "#b45309", // darker so it reads on light
  blue: "#2563eb",
  magenta: "#9333ea",
  cyan: "#0891b2",
  white: "#52525b",
  brightBlack: "#71717a",
  brightRed: "#b91c1c",
  brightGreen: "#15803d",
  brightYellow: "#92400e",
  brightBlue: "#1d4ed8",
  brightMagenta: "#7e22ce",
  brightCyan: "#0e7490",
  brightWhite: "#27272a",
};

/** Whether the terminal should be dark — follows the resolved app theme
 * (Settings: light / dark / system; DEC-043). SSR-safe (defaults to dark). */
export function prefersDark(): boolean {
  if (typeof window === "undefined") return true;
  return resolveDark();
}

export function terminalTheme(dark = prefersDark()): ITheme {
  return dark ? DARK_TERMINAL : LIGHT_TERMINAL;
}
