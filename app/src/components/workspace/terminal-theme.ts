// xterm.js themes that follow the app's light/dark scheme (DEC-033). Bezier's
// brand principle #4 (PRINCIPLES §4 "dissolve the terminal"): the agent's work
// is never a hostile black slab — its surface sits one step under the app's ink
// background (--background/--card), and its chrome (cursor, selection) is neutral
// monochrome (DEC-048 — no brand hue), so the terminal reads as part of the
// workbench, not a console bolted on. ANSI 16 stay legible (Claude Code emits
// ANSI colors — they're functional content, exempt like --destructive); only the
// slab-black bg, the cursor and the selection shift onto the (monochrome) brand.

import type { ITheme } from "@xterm/xterm";
import { resolveDark } from "@/lib/settings";

export const DARK_TERMINAL: ITheme = {
  background: "#1a1a22", // ink, between --background and --card — not pure black
  foreground: "#e6e6ea",
  cursor: "#cfcfdc", // neutral (monochrome)
  cursorAccent: "#1a1a22",
  selectionBackground: "#34343f", // neutral wash
  black: "#2a2a33",
  red: "#f28b82",
  green: "#7dd99a",
  yellow: "#e8c275",
  blue: "#7b84ef", // ANSI blue (terminal content)
  magenta: "#b99cf0",
  cyan: "#6fd3e0",
  white: "#e6e6ea",
  brightBlack: "#52525f",
  brightRed: "#fca5a5",
  brightGreen: "#9ae6b4",
  brightYellow: "#f3d79a",
  brightBlue: "#9aa2f5",
  brightMagenta: "#d2bdf6",
  brightCyan: "#8fe1ec",
  brightWhite: "#fafafa",
};

export const LIGHT_TERMINAL: ITheme = {
  background: "#fcfcfb", // warm off-white = --card, not a tinted slab
  foreground: "#2a2a31",
  cursor: "#44444e", // neutral (monochrome)
  cursorAccent: "#fcfcfb",
  selectionBackground: "#e6e6ea", // neutral wash
  black: "#3f3f46",
  red: "#cf4b3f",
  green: "#2f8f57",
  yellow: "#9a6b16",
  blue: "#4750d4", // ANSI blue (terminal content)
  magenta: "#7c4fcf",
  cyan: "#0e8aa3",
  white: "#52525b",
  brightBlack: "#71717a",
  brightRed: "#b3392f",
  brightGreen: "#1f7a45",
  brightYellow: "#7c5310",
  brightBlue: "#3a43c2",
  brightMagenta: "#6a3fb8",
  brightCyan: "#0c6e82",
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
