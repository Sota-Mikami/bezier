// Local-only logging. NO external telemetry — `app_log` appends to a log file
// inside Bezier's app-data dir (see src-tauri). Used by the error boundaries and
// the global error handlers so field crashes are recoverable from local logs.

import { invoke } from "@tauri-apps/api/core";

export type LogLevel = "error" | "warn" | "info";

/**
 * Best-effort append to Bezier's local log file. Never throws — safe to call
 * from error boundaries and global handlers. In browser dev (no Tauri) the
 * invoke rejects and is swallowed.
 */
export async function appLog(level: LogLevel, message: string): Promise<void> {
  try {
    await invoke("app_log", { level, message });
  } catch {
    // Tauri command unavailable — local-file logging is best-effort only.
  }
}

/** Log a client-side error locally (console + local file). Never throws. */
export function logClientError(scope: string, error: unknown): void {
  const err = error as { message?: string; stack?: string } | undefined;
  const detail = err?.stack || err?.message || String(error);
  const line = `[${scope}] ${detail}`;
  try {
    console.error("[bezier]", line);
  } catch {
    // console may be unavailable in some embedded webview states.
  }
  void appLog("error", line);
}

let installed = false;

/**
 * Attach window-level handlers so uncaught errors and unhandled promise
 * rejections also land in the local log. Idempotent; call once on mount.
 */
export function installGlobalErrorLogging(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => {
    logClientError("window.onerror", e.error ?? e.message);
  });
  window.addEventListener("unhandledrejection", (e) => {
    logClientError("unhandledrejection", e.reason);
  });
}
