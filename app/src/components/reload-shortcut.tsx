"use client";

// Cmd/Ctrl+R reloads the webview. A Tauri WKWebView is not a browser, so it has
// no built-in reload shortcut; this wires one up (and Cmd+Shift+R too) by
// listening for the keystroke and re-requesting the page — which picks up the
// latest dev build / HMR output.

import * as React from "react";

export function ReloadShortcut() {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "r") {
        e.preventDefault();
        window.location.reload();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
