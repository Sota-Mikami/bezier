// Agent C — thin helpers over the frozen IPC contract (src/lib/ipc.ts).
// Do NOT redefine FileEntry / OpenDoc / Frontmatter here — import them.

import {
  listDir,
  readFile,
  pickFolder,
  type FileEntry,
  type OpenDoc,
} from "@/lib/ipc";
import { splitFrontmatter, classify } from "@/lib/markdown";

export type { FileEntry, OpenDoc };

/** Extensions surfaced in the workspace tree (plus directories). */
const VISIBLE_EXTS: ReadonlySet<FileEntry["ext"]> = new Set(["md", "mdx", "yaml"]);

/** Keep only directories and the document types we edit, sorted dirs-first then by name. */
export function filterEntries(entries: FileEntry[]): FileEntry[] {
  return entries
    .filter((e) => e.isDir || VISIBLE_EXTS.has(e.ext))
    .sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

/** Open a native folder picker; returns the chosen root path or null if cancelled. */
export function openFolder(): Promise<string | null> {
  return pickFolder();
}

/** List one directory level, filtered + sorted for the tree. */
export async function listTree(path: string): Promise<FileEntry[]> {
  const entries = await listDir(path);
  return filterEntries(entries);
}

/**
 * Read a file and assemble the frozen OpenDoc shape:
 * readFile -> splitFrontmatter (byte-preserving raw block + typed data) -> classify body.
 */
export async function readDoc(path: string): Promise<OpenDoc> {
  const text = await readFile(path);
  const { rawFrontmatter, data, body } = splitFrontmatter(text);
  const ext = extOf(path);
  return {
    path,
    ext,
    rawFrontmatter,
    frontmatter: data,
    body,
    editable: classify(body),
  };
}

/** Lowercased extension without the dot (e.g. "md"), or "" when none. */
export function extOf(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot + 1).toLowerCase();
}
