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

/**
 * Open a folder in the user's IDE (first installed of cursor/code/…). Returns the
 * editor's display name. -> invoke("open_in_editor", { path })
 */
export function openInEditor(path: string): Promise<string> {
  return invoke<string>("open_in_editor", { path });
}

/**
 * Recursively remove a file or directory. Guarded on the Rust side to only
 * delete paths under a `.continuum` working store (continuum's local issue
 * artifacts), never arbitrary repo files. No-op when the path is absent.
 * -> invoke("remove_path", { path })
 */
export function removePath(path: string): Promise<void> {
  return invoke<void>("remove_path", { path });
}

/**
 * Move/rename a file or directory. Guarded on the Rust side to paths under a
 * `.continuum` working store (used to shuffle issues into / out of the trash).
 * -> invoke("move_path", { from, to })
 */
export function movePath(from: string, to: string): Promise<void> {
  return invoke<void>("move_path", { from, to });
}

/**
 * The continuum app-data directory (created if absent). Worktrees are hosted
 * here, OUTSIDE the user's repo, so workspace-root inference (Next.js/Turbopack)
 * doesn't trip over the parent repo's lockfile. -> invoke("app_data_dir")
 */
export function appDataDir(): Promise<string> {
  return invoke<string>("app_data_dir");
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
