// FROZEN CONTRACT — Tauri command bindings.
// Command name strings and shapes are frozen. Do NOT redefine or change
// signatures. The Rust serde structs MUST mirror these shapes exactly
// (camelCase: isDir).

import { invoke } from "@tauri-apps/api/core";
import {
  open,
  confirm as tauriConfirm,
  message as tauriMessage,
} from "@tauri-apps/plugin-dialog";
import type { Frontmatter } from "@/lib/frontmatter";

/**
 * Native confirm dialog. WKWebView's `window.confirm()` is unreliable inside
 * Tauri (can return immediately without showing), so destructive confirmations
 * must go through the dialog plugin. Resolves true when the user confirms.
 */
export function confirmDialog(
  message: string,
  opts?: { title?: string; okLabel?: string; cancelLabel?: string },
): Promise<boolean> {
  return tauriConfirm(message, {
    kind: "warning",
    okLabel: opts?.okLabel,
    cancelLabel: opts?.cancelLabel,
    ...(opts?.title ? { title: opts.title } : {}),
  });
}

/** Native message dialog (WKWebView's `window.alert()` is likewise unreliable). */
export async function messageDialog(
  text: string,
  opts?: { title?: string; kind?: "info" | "warning" | "error" },
): Promise<void> {
  await tauriMessage(text, {
    kind: opts?.kind ?? "error",
    ...(opts?.title ? { title: opts.title } : {}),
  });
}

export interface FileEntry {
  path: string;
  name: string;
  isDir: boolean;
  ext: "md" | "mdx" | "yaml" | "";
}

export interface OpenDoc {
  path: string;
  ext: string;
  rawFrontmatter: string | null;
  frontmatter: Frontmatter;
  body: string;
}

/** List a directory's immediate children. -> invoke("list_dir", { path }) */
export function listDir(path: string): Promise<FileEntry[]> {
  return invoke<FileEntry[]>("list_dir", { path });
}

/**
 * A directory entry from `list_dir_all` — like FileEntry but `ext` is the raw
 * lowercased extension ("tsx" | "css" | "json" | …), not the doc allowlist. For
 * the Code browser's worktree source tree (DEC-059).
 */
export interface TreeEntry {
  path: string;
  name: string;
  isDir: boolean;
  ext: string;
}

/**
 * List a directory's immediate children, surfacing EVERY file (raw extension)
 * rather than only docs. Skips dotfiles + node_modules/target/.next/out.
 * Lazy per-directory (the tree expands on click). -> invoke("list_dir_all", { path })
 */
export function listDirAll(path: string): Promise<TreeEntry[]> {
  return invoke<TreeEntry[]>("list_dir_all", { path });
}

/** One matching line within a file (grep_files). */
export interface GrepLine {
  line: number;
  text: string;
}

/** A file with ≥1 content match (grep_files), grouped with its matching lines. */
export interface GrepFile {
  path: string;
  name: string;
  ext: string;
  matches: GrepLine[];
}

/**
 * Grep file CONTENTS under `root` for `query` (case-insensitive), grouped by
 * file — the Code browser's "in files" search (DEC-059). Skips dotfiles,
 * node_modules/target/.next/out, >1MB and binary files. Bounded by `limit`
 * TOTAL matches (0 → 400 default). -> invoke("grep_files", { root, query, limit })
 */
export function grepFiles(
  root: string,
  query: string,
  limit = 0,
): Promise<GrepFile[]> {
  return invoke<GrepFile[]>("grep_files", { root, query, limit });
}

/** Read a file's contents as UTF-8 text. -> invoke("read_file", { path }) */
export function readFile(path: string): Promise<string> {
  return invoke<string>("read_file", { path });
}

/** Write contents to a file. -> invoke("write_file", { path, contents }) */
export function writeFile(path: string, contents: string): Promise<void> {
  return invoke<void>("write_file", { path, contents });
}

/**
 * Write raw bytes to a file (pasted/dropped Spec images, DEC-043). Auto-creates
 * parent dirs. -> invoke("write_file_bytes", { path, bytes })
 */
export function writeFileBytes(path: string, bytes: Uint8Array): Promise<void> {
  return invoke<void>("write_file_bytes", { path, bytes: Array.from(bytes) });
}

/** Read a file's raw bytes (image preview, DEC-043). -> invoke("read_file_bytes", { path }) */
export async function readFileBytes(path: string): Promise<Uint8Array> {
  const arr = await invoke<number[]>("read_file_bytes", { path });
  return Uint8Array.from(arr);
}

/** Reveal a path in the macOS Finder (DEC-041). -> invoke("reveal_in_finder", { path }) */
export function revealInFinder(path: string): Promise<void> {
  return invoke<void>("reveal_in_finder", { path });
}

/** Open an http(s) URL in the default browser (DEC-074). -> invoke("open_external", { url }) */
export function openExternal(url: string): Promise<void> {
  return invoke<void>("open_external", { url });
}

/**
 * Capture a screen region (POINTS, global top-left origin) to a PNG (DEC-045 —
 * design feedback). Returns the written path. -> invoke("capture_region", …)
 */
export function captureRegion(
  x: number,
  y: number,
  width: number,
  height: number,
  outPath: string,
): Promise<string> {
  return invoke<string>("capture_region", { x, y, width, height, outPath });
}

/**
 * Open a folder in the user's IDE (first installed of cursor/code/…). Returns the
 * editor's display name. -> invoke("open_in_editor", { path })
 */
export function openInEditor(path: string): Promise<string> {
  return invoke<string>("open_in_editor", { path });
}

/**
 * Recursively remove a file or directory. Guarded on the Rust side to only
 * delete paths under a `.bezier` working store (Bezier's local issue
 * artifacts), never arbitrary repo files. No-op when the path is absent.
 * -> invoke("remove_path", { path })
 */
export function removePath(path: string): Promise<void> {
  return invoke<void>("remove_path", { path });
}

/**
 * Move/rename a file or directory. Guarded on the Rust side to paths under a
 * `.bezier` working store (used to shuffle issues into / out of the trash).
 * -> invoke("move_path", { from, to })
 */
export function movePath(from: string, to: string): Promise<void> {
  return invoke<void>("move_path", { from, to });
}

/**
 * The Bezier app-data directory (created if absent). Worktrees are hosted
 * here, OUTSIDE the user's repo, so workspace-root inference (Next.js/Turbopack)
 * doesn't trip over the parent repo's lockfile. -> invoke("app_data_dir")
 */
export function appDataDir(): Promise<string> {
  return invoke<string>("app_data_dir");
}

/** The user's home dir. Used to install Bezier's `~/.claude/commands/bezier/`
 * slash-command pack (DEC-076). -> invoke("home_dir") */
export function homeDir(): Promise<string> {
  return invoke<string>("home_dir");
}

/** Remove the `~/.claude/commands/bezier/` slash-command pack (DEC-076). The path
 * is resolved on the Rust side, so this only ever targets that one dir.
 * -> invoke("uninstall_bezier_commands") */
export function uninstallBezierCommands(): Promise<void> {
  return invoke<void>("uninstall_bezier_commands");
}

/** Open a native folder picker. Returns the chosen path, or null if cancelled. */
export async function pickFolder(): Promise<string | null> {
  const selected = await open({ directory: true, multiple: false });
  if (selected == null) return null;
  // With multiple:false the dialog plugin returns a single string path.
  return Array.isArray(selected) ? (selected[0] ?? null) : selected;
}

/** Open a native image-file picker (multi-select). Returns the chosen paths
 * (empty when cancelled). Used by the "/Image" slash command (DEC-044). */
export async function pickImageFiles(): Promise<string[]> {
  const selected = await open({
    directory: false,
    multiple: true,
    filters: [
      {
        name: "画像",
        extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp"],
      },
    ],
  });
  if (selected == null) return [];
  return Array.isArray(selected) ? selected : [selected];
}
