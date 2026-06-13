"use client";

// Confirm before the app actually stops (DEC-061). A Tauri window close (red
// traffic-light button, or any window.close()) fires `onCloseRequested`; we
// prevent it and ask first, so the app never disappears from under an unsaved
// edit. ⌘W no longer closes the window (the native accelerator was removed in
// Rust), so this only triggers on a deliberate close — but we still confirm.
//
// Note: ⌘Q (Quit) is an explicit quit and bypasses this; that's intentional.

import * as React from "react";

export function AppCloseGuard() {
  React.useEffect(() => {
    let unlisten: (() => void) | undefined;
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
        if (disposed) un();
        else unlisten = un;
      } catch {
        /* not running inside Tauri — nothing to guard */
      }
    })();
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
  return null;
}

export default AppCloseGuard;
