"use client";

// Menu-shortcut bridge (DEC-120 follow-up). A native embedded webview steals
// keyboard focus, so Bezier's window-keydown shortcuts (⌘K, ⌘⇧A, ⌘N) don't fire
// while the maker is interacting with the embedded browser. Native MENU
// accelerators DO fire regardless of which webview is focused (macOS routes ⌘
// key-equivalents to the app menu first), so lib.rs registers them and emits
// `bezier://menu-shortcut`. Here we translate that back into the exact synthetic
// keydown the existing handlers already listen for — so Bezier shortcuts win
// even from inside the embedded browser, with zero changes to those handlers.
//
// To test the PREVIEWED app's own shortcuts instead, open its localhost in a
// real browser via the ↗ button (CEO direction: Bezier's shortcuts take
// priority in-app).

import * as React from "react";

// chord id (from lib.rs) → the KeyboardEvent the matching handler checks for.
// Keep in sync with the handlers: command-palette (key "k"), annotation-mode
// (code "KeyA" + shift), app-sidebar (key "n").
const CHORDS: Record<string, KeyboardEventInit> = {
  palette: { key: "k", code: "KeyK", metaKey: true },
  annotate: { key: "A", code: "KeyA", metaKey: true, shiftKey: true },
  newIssue: { key: "n", code: "KeyN", metaKey: true },
};

export function MenuShortcutBridge() {
  React.useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const un = await listen<string>("bezier://menu-shortcut", (e) => {
          const init = CHORDS[e.payload];
          if (!init) return;
          window.dispatchEvent(
            new KeyboardEvent("keydown", { ...init, bubbles: true, cancelable: true }),
          );
        });
        if (disposed) un();
        else unlisten = un;
      } catch {
        /* not in Tauri (e.g. plain web preview) — no menu, nothing to bridge */
      }
    })();
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
  return null;
}

export default MenuShortcutBridge;
