// FROZEN CONTRACT (v0.2) — embedded terminal bindings over Rust portable-pty.
//
// Command name strings, event names, and shapes are frozen. Do NOT redefine or
// change signatures. The Rust side (src-tauri/src/lib.rs) MUST mirror these
// shapes exactly — structs use `#[serde(rename_all = "camelCase")]` so the
// snake_case Rust fields serialize as the camelCase fields used below. A casing
// mismatch silently yields `undefined` on the JS side.
//
// EVENT CONTRACT:
//   Rust emits "pty://data" with { id, chunk } where `chunk` is the UTF-8 lossy
//   string of pty output bytes, and "pty://exit" with { id, code } where `code`
//   is the process exit code (null if unknown / signal-killed).

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type { UnlistenFn };

/**
 * Make a captured (ANSI-stripped) pty log read like the terminal did: render
 * carriage-return overwrites (CLIs like vercel/pnpm redraw a spinner/progress on
 * the SAME line via `\r`) and drop the braille spinner glyphs. Without this, every
 * spinner frame is appended, so a deploy log becomes hundreds of repeated
 * "Installing dependencies…" lines that bury the real error. Per `\n` line we keep
 * only what's after the last `\r` (the final rendered state). Idempotent.
 */
export function renderProgress(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const cr = line.lastIndexOf("\r");
      const rendered = cr >= 0 ? line.slice(cr + 1) : line;
      // Strip leading braille spinner frames (U+2800–U+28FF) + their trailing space.
      return rendered.replace(/[⠀-⣿]\s*/g, "");
    })
    .join("\n");
}

/** Options for spawning a pty-backed child process. */
export interface PtySpawnOpts {
  /** Working directory the shell/agent is launched in (workspace root). */
  cwd: string;
  /** Executable to run (e.g. the user shell, or "claude"). */
  cmd: string;
  /** Arguments passed to `cmd`. */
  args?: string[];
  /** Initial terminal width in columns. */
  cols: number;
  /** Initial terminal height in rows. */
  rows: number;
  /**
   * Optional stable key (the issue id). When set, the pty PERSISTS after the
   * terminal unmounts (a background agent keeps running) and can be reattached
   * via ptyLookup + ptyBacklog. Omit for throwaway shells.
   */
  key?: string;
  /**
   * Optional path to the agent's hook-events file. The agent is launched with
   * Stop/Notification hooks that append here when it awaits the user; the
   * backend watches this file for DETERMINISTIC "waiting" detection.
   */
  eventsPath?: string;
}

/** Payload of the "pty://data" event. */
export interface PtyDataEvent {
  id: string;
  chunk: string;
}

/** Payload of the "pty://exit" event. */
export interface PtyExitEvent {
  id: string;
  code: number | null;
}

/**
 * Spawn a pty-backed child process. Resolves to the new pty's id (uuid string),
 * used to address every subsequent write/resize/kill and to filter events.
 * -> invoke("pty_spawn", { opts })
 */
export function ptySpawn(opts: PtySpawnOpts): Promise<string> {
  return invoke<string>("pty_spawn", { opts });
}

/**
 * Write raw input (keystrokes / paste) to the pty's stdin.
 * -> invoke("pty_write", { id, data })
 */
export function ptyWrite(id: string, data: string): Promise<void> {
  return invoke<void>("pty_write", { id, data });
}

/**
 * Resize the pty's window (call on container/FitAddon resize).
 * -> invoke("pty_resize", { id, cols, rows })
 */
export function ptyResize(id: string, cols: number, rows: number): Promise<void> {
  return invoke<void>("pty_resize", { id, cols, rows });
}

/**
 * Kill the child process and release the pty session.
 * -> invoke("pty_kill", { id })
 */
export function ptyKill(id: string): Promise<void> {
  return invoke<void>("pty_kill", { id });
}

/**
 * Find a still-running persistent pty by its stable key (issue id). Returns its
 * id to REATTACH to, or null. -> invoke("pty_lookup", { key })
 */
export function ptyLookup(key: string): Promise<string | null> {
  return invoke<string | null>("pty_lookup", { key });
}

/** The captured output backlog of a session (for replay on reattach). */
export function ptyBacklog(id: string): Promise<string> {
  return invoke<string>("pty_backlog", { id });
}

/** Kill every live session with this key (issue id). Used on Discard / Re-run. */
export function ptyKillKey(key: string): Promise<void> {
  return invoke<void>("pty_kill_key", { key });
}

/** Keys (issue ids) of all live agent sessions — for "running" indicators. */
export function ptyActiveKeys(): Promise<string[]> {
  return invoke<string[]>("pty_active_keys");
}

/**
 * Build the `--settings` JSON for a Claude launch:
 *  - Stop/Notification hooks → append to `eventsPath` (deterministic "awaiting
 *    the user" signal), and
 *  - `theme` matched to the terminal background. Claude's TUI emits colors tuned
 *    for its theme; without matching it, a light terminal renders Claude's
 *    dark-tuned output washed-out. Syncing the theme keeps it legible (best
 *    practice for embedding an agent TUI).
 */
export function agentHookSettings(
  eventsPath: string,
  theme?: "light" | "dark",
): string {
  // The hook command appends one byte; the backend watches the file's growth.
  const cmd = `printf . >> ${JSON.stringify(eventsPath)}`;
  const entry = [{ hooks: [{ type: "command", command: cmd }] }];
  const settings: Record<string, unknown> = {
    hooks: { Stop: entry, Notification: entry },
  };
  if (theme) settings.theme = theme;
  return JSON.stringify(settings);
}

/** Per-agent status for the Agent Inbox (DEC-028). */
export type AgentState = "running" | "waiting" | "done" | "error";
export interface AgentStatus {
  /** The issue id. */
  key: string;
  state: AgentState;
  /** Milliseconds since the agent last produced output. */
  idleMs: number;
  /** Exit code when state is done/error, else null. */
  exitCode: number | null;
}

/**
 * Snapshot of every keyed agent's status. "waiting" is set deterministically by
 * the agent's hooks (turn ended / asked for input), cleared on user input.
 */
export function ptyStatuses(): Promise<AgentStatus[]> {
  return invoke<AgentStatus[]>("pty_statuses");
}

/** Acknowledge/remove an EXITED agent for this key from the inbox. */
export function ptyDismiss(key: string): Promise<void> {
  return invoke<void>("pty_dismiss", { key });
}

/**
 * Subscribe to pty output. The callback fires for ALL ptys; filter on `id`.
 * Returns an UnlistenFn — call it on unmount to detach.
 */
export function onPtyData(
  cb: (p: PtyDataEvent) => void,
): Promise<UnlistenFn> {
  return listen<PtyDataEvent>("pty://data", (e) => cb(e.payload));
}

/**
 * Subscribe to pty exit. Fires once per pty when its child process ends.
 * Returns an UnlistenFn — call it on unmount to detach.
 */
export function onPtyExit(
  cb: (p: PtyExitEvent) => void,
): Promise<UnlistenFn> {
  return listen<PtyExitEvent>("pty://exit", (e) => cb(e.payload));
}

/**
 * Probe whether an executable is resolvable on PATH (used for agent detection
 * and to choose a shell). -> invoke("command_exists", { name })
 */
export function commandExists(name: string): Promise<boolean> {
  return invoke<boolean>("command_exists", { name });
}

/**
 * Resolve `name` to a preferred absolute executable path on PATH ("" when not
 * found). Skips app-bundled shims (e.g. cmux.app's `claude`, which bridges
 * sessions and can't replay a transcript on `--continue`) in favor of a real
 * CLI install, so the launched agent actually persists resumable sessions.
 * -> invoke("resolve_command", { name })
 */
export function resolveCommand(name: string): Promise<string> {
  return invoke<string>("resolve_command", { name });
}
