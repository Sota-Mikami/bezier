"use client";

// Confirm before the app actually stops (DEC-061/062), and route ⌘W when the
// Code view isn't on screen. A Tauri window close (red traffic-light button, or
// any window.close()) fires `onCloseRequested`; we prevent it and ask first, so
// the app never disappears from under an unsaved edit.
//
// ⌘W: the native "Close Window" accelerator was removed in Rust, so ⌘W reaches
// the webview. The Code browser claims ⌘W (in the capture phase) ONLY when it's
// visible, to close a tab. Otherwise this handler (bubble phase) runs and closes
// the window — which goes through the same confirm. So:
//   - viewing Code → ⌘W closes a Code tab
//   - anywhere else → ⌘W closes the app (with confirm)
//
// ⌘Q: the native Quit was replaced (Rust) by a custom item that EMITS
// `bezier://quit-requested` instead of quitting; we confirm here too (DEC-063),
// so the app never terminates abruptly.

import * as React from "react";

import { tt } from "@/lib/i18n";

export function AppCloseGuard() {
  React.useEffect(() => {
    let unlistenClose: (() => void) | undefined;
    let unlistenQuit: (() => void) | undefined;
    let onKey: ((e: KeyboardEvent) => void) | undefined;
    let disposed = false;
    let confirming = false; // guard against stacking dialogs

    (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const { listen } = await import("@tauri-apps/api/event");
        const { confirm } = await import("@tauri-apps/plugin-dialog");
        const win = getCurrentWindow();

        const confirmQuit = async (): Promise<boolean> => {
          if (confirming) return false;
          confirming = true;
          try {
            return await confirm(tt("closeGuard.quitMessage"), {
              title: tt("closeGuard.quitTitle"),
              kind: "warning",
              okLabel: tt("closeGuard.quitConfirm"),
              cancelLabel: tt("closeGuard.quitCancel"),
            });
          } finally {
            confirming = false;
          }
        };

        const unClose = await win.onCloseRequested(async (event) => {
          event.preventDefault();
          if (await confirmQuit()) await win.destroy();
        });
        // ⌘Q (custom menu item) → confirm, then destroy (quits the app).
        const unQuit = await listen("bezier://quit-requested", async () => {
          if (await confirmQuit()) await win.destroy();
        });

        if (disposed) {
          unClose();
          unQuit();
          return;
        }
        unlistenClose = unClose;
        unlistenQuit = unQuit;

        // ⌘W fallback: close the window (→ onCloseRequested → confirm) when the
        // Code browser didn't already claim it (it stops propagation when it does).
        onKey = (e: KeyboardEvent) => {
          if (
            (e.metaKey || e.ctrlKey) &&
            !e.shiftKey &&
            !e.altKey &&
            e.key.toLowerCase() === "w"
          ) {
            e.preventDefault();
            void win.close();
          }
        };
        window.addEventListener("keydown", onKey);
      } catch {
        /* not running inside Tauri — nothing to guard */
      }
    })();

    return () => {
      disposed = true;
      unlistenClose?.();
      unlistenQuit?.();
      if (onKey) window.removeEventListener("keydown", onKey);
    };
  }, []);
  return null;
}

export default AppCloseGuard;
