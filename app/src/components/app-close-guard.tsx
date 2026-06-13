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
// Note: ⌘Q (Quit) is an explicit quit and bypasses this; that's intentional.

import * as React from "react";

export function AppCloseGuard() {
  React.useEffect(() => {
    let unlisten: (() => void) | undefined;
    let onKey: ((e: KeyboardEvent) => void) | undefined;
    let disposed = false;
    (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const { confirm } = await import("@tauri-apps/plugin-dialog");
        const win = getCurrentWindow();
        const un = await win.onCloseRequested(async (event) => {
          event.preventDefault();
          const ok = await confirm("Bezier を終了しますか？", {
            title: "終了の確認",
            kind: "warning",
            okLabel: "終了",
            cancelLabel: "やめる",
          });
          if (ok) await win.destroy();
        });
        if (disposed) {
          un();
          return;
        }
        unlisten = un;

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
      unlisten?.();
      if (onKey) window.removeEventListener("keydown", onKey);
    };
  }, []);
  return null;
}

export default AppCloseGuard;
