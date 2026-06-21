// FROZEN CONTRACT — Tauri command bindings.
// Command name strings and shapes are frozen. Do NOT redefine or change
// signatures. The Rust serde structs MUST mirror these shapes exactly
// (camelCase: isDir).

import { invoke } from "@tauri-apps/api/core";
import {
  open,
  save as tauriSave,
  confirm as tauriConfirm,
  message as tauriMessage,
} from "@tauri-apps/plugin-dialog";
import type { Frontmatter } from "@/lib/frontmatter";
import { tt } from "@/lib/i18n";

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

/** Grant a filesystem root to Bezier's custom file commands. */
export function grantPath(path: string): Promise<string> {
  return invoke<string>("grant_path", { path });
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

/**
 * A path's modified time as epoch milliseconds, or null when it does not exist
 * (DEC-111 Phase 1.5 — lockfile-vs-install staleness). Works for files & dirs.
 * -> invoke("path_mtime", { path })
 */
export function pathMtime(path: string): Promise<number | null> {
  return invoke<number | null>("path_mtime", { path });
}

/**
 * Node versions installed under the user's nvm (`~/.nvm/versions/node`), bare
 * (e.g. "24.16.0"); `[]` when nvm isn't set up. Grant-free — nvm lives outside any
 * repo, so it must NOT go through the grant-checked list_dir (DEC-111).
 * -> invoke("nvm_node_versions")
 */
export function nvmNodeVersions(): Promise<string[]> {
  return invoke<string[]>("nvm_node_versions");
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
 * Open the local dev URL in a dedicated TOP-LEVEL Bezier window (not the embedded
 * iframe) so OAuth (redirect + popup), 2FA, and `window.open`/new-tab flows — which
 * providers refuse to run in an iframe — complete inside Bezier. Loopback URLs only.
 * -> invoke("open_live_window", { url })
 */
export function openLiveWindow(url: string): Promise<void> {
  return invoke<void>("open_live_window", { url });
}

/**
 * Embedded browser (DEC-120, cmux-style) — a native child webview pinned INTO
 * the Preview pane (not an iframe). First-party + top-level, so OAuth completes
 * inline and the session persists. Coordinates are LOGICAL/CSS px relative to
 * the window content top-left (pass getBoundingClientRect() values verbatim). A
 * native webview always paints above HTML, so the caller hides it when the pane
 * isn't the active surface.
 */
export function embedBrowserOpen(
  url: string,
  x: number,
  y: number,
  width: number,
  height: number,
): Promise<void> {
  return invoke<void>("embed_browser_open", { url, x, y, width, height });
}

/** Reposition/resize the embedded browser to follow the pane (logical px). */
export function embedBrowserSetBounds(
  x: number,
  y: number,
  width: number,
  height: number,
): Promise<void> {
  return invoke<void>("embed_browser_set_bounds", { x, y, width, height });
}

/** Navigate the embedded browser (route change / reload). */
export function embedBrowserNavigate(url: string): Promise<void> {
  return invoke<void>("embed_browser_navigate", { url });
}

/** Read the embedded browser's current URL (to sync the address bar to where
 *  the page actually navigated). Null if no embedded browser exists yet. */
export function embedBrowserUrl(): Promise<string | null> {
  return invoke<string | null>("embed_browser_url");
}

/** Hide the embedded browser (kept alive; just not shown). */
export function embedBrowserHide(): Promise<void> {
  return invoke<void>("embed_browser_hide");
}

/** Destroy the embedded browser. */
export function embedBrowserClose(): Promise<void> {
  return invoke<void>("embed_browser_close");
}

/** Visual editor (DEC-131): push JS into the embedded browser (apply a style /
 *  activate the overlay / inject the agent). Fire-and-forget. */
export function embedBrowserEval(js: string): Promise<void> {
  return invoke<void>("embed_browser_eval", { js });
}

/** Visual editor (DEC-131): evaluate `js` in the embedded browser and emit its
 *  JSON-serialized result back as a `bz-edit` event (page→Bezier drain channel). */
export function embedBrowserDrain(js: string): Promise<void> {
  return invoke<void>("embed_browser_drain", { js });
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
 * Remove a worktree's `.vercel/` link dir so the next `vercel deploy` re-links
 * under the current --scope (DEC-098). Guarded on the Rust side to only delete a
 * `.vercel` directory. -> invoke("remove_vercel_dir", { dir })
 */
export function removeVercelDir(dir: string): Promise<void> {
  return invoke<void>("remove_vercel_dir", { dir });
}

/**
 * Collect every PUBLIC env var (`VITE_*` / `NEXT_PUBLIC_*`) from all `.env` files
 * under `root` (root + workspace subdirs). Secrets are filtered out on the Rust
 * side — only public keys cross. Used by publish to inject build-time public env
 * for a monorepo whose app-level vars (e.g. VITE_APP_ENV) live in a workspace dir,
 * not the root. -> invoke("collect_public_env", { root })
 */
export function collectPublicEnv(root: string): Promise<[string, string][]> {
  return invoke<[string, string][]>("collect_public_env", { root });
}

/**
 * Scan a built static output dir for absolute `https://host` origins inlined in
 * runtime files (.js/.html/.css/.json) — an app's candidate backend origins to
 * same-origin-proxy in the share deploy (DEC-115). Grant-checked.
 * -> invoke("scan_text_origins", { dir })
 */
export function scanTextOrigins(dir: string): Promise<string[]> {
  return invoke<string[]>("scan_text_origins", { dir });
}

/**
 * Replace literal substrings across runtime files under `dir` (each `[from, to]`,
 * applied longest-`from`-first). Repoints inlined backend origins to same-origin
 * proxy prefixes before a static share deploy. Returns the replacement count.
 * -> invoke("rewrite_in_dir", { dir, pairs })
 */
export function rewriteInDir(dir: string, pairs: [string, string][]): Promise<number> {
  return invoke<number>("rewrite_in_dir", { dir, pairs });
}

/** Result of pushing the repo's env to a Vercel project. */
export interface VercelSyncResult {
  pushed: number;
  failed: number;
  linkFailed: boolean;
}

/**
 * Register the repo's env (incl. SECRETS) on a Vercel project so every future
 * deploy has it (DEC-114 Option B). Links `cwd` to `project`, then upserts each
 * `.env` var (root + workspace subdirs) to the project's PRODUCTION target. CONSENT
 * is the caller's responsibility — this sends env to the user's Vercel.
 * -> invoke("vercel_sync_env", { cwd, project, scope, root })
 */
export function vercelSyncEnv(
  cwd: string,
  project: string,
  scope: string,
  root: string,
  overrides: [string, string][],
): Promise<VercelSyncResult> {
  return invoke<VercelSyncResult>("vercel_sync_env", {
    cwd,
    project,
    scope,
    root,
    overrides,
  });
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

/** Remove ONE command (`~/.claude/commands/bezier/<name>.md`). `name` is validated
 * as a bare slug on the Rust side. -> invoke("remove_bezier_command", { name }) */
export function removeBezierCommand(name: string): Promise<void> {
  return invoke<void>("remove_bezier_command", { name });
}

/** Open a native single-file picker (optionally filtered by extension). Returns
 * the chosen path, or null if cancelled. Used by command-pack import (DEC-081). */
export async function pickFile(
  filters?: { name: string; extensions: string[] }[],
): Promise<string | null> {
  const selected = await open({ directory: false, multiple: false, filters });
  if (selected == null) return null;
  const path = Array.isArray(selected) ? (selected[0] ?? null) : selected;
  if (path) await grantPath(path).catch(() => {});
  return path;
}

/** Native save-file dialog. Returns the chosen path, or null if cancelled. Used
 * by command-pack export (DEC-081). */
export async function saveFileDialog(opts?: {
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
}): Promise<string | null> {
  const path = await tauriSave(opts);
  if (path) await grantPath(parentPath(path)).catch(() => {});
  return path;
}

/** Open a native folder picker. Returns the chosen path, or null if cancelled. */
export async function pickFolder(): Promise<string | null> {
  const selected = await open({ directory: true, multiple: false });
  if (selected == null) return null;
  // With multiple:false the dialog plugin returns a single string path.
  const path = Array.isArray(selected) ? (selected[0] ?? null) : selected;
  if (path) await grantPath(path).catch(() => {});
  return path;
}

/** Open a native image-file picker (multi-select). Returns the chosen paths
 * (empty when cancelled). Used by the "/Image" slash command (DEC-044). */
export async function pickImageFiles(): Promise<string[]> {
  const selected = await open({
    directory: false,
    multiple: true,
    filters: [
      {
        name: tt("imageInsert.pickerName"),
        extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp"],
      },
    ],
  });
  if (selected == null) return [];
  const paths = Array.isArray(selected) ? selected : [selected];
  await Promise.all(paths.map((p) => grantPath(p).catch(() => "")));
  return paths;
}

function parentPath(path: string): string {
  return path.replace(/\/+$/, "").replace(/\/[^/]*$/, "") || "/";
}
