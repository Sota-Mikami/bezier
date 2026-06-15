// Agent C — thin helpers over the frozen IPC contract (src/lib/ipc.ts).
// Do NOT redefine FileEntry / OpenDoc / Frontmatter here — import them.

import {
  grantPath,
  listDir,
  readFile,
  pickFolder,
  type FileEntry,
  type OpenDoc,
} from "@/lib/ipc";
import { splitFrontmatter } from "@/lib/markdown";

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
export async function openFolder(): Promise<string | null> {
  const picked = await pickFolder();
  if (picked) await grantPath(picked);
  return picked;
}

/** List one directory level, filtered + sorted for the tree. */
export async function listTree(path: string): Promise<FileEntry[]> {
  const entries = await listDir(path);
  return filterEntries(entries);
}

/**
 * Read a file and assemble the OpenDoc shape:
 * readFile -> splitFrontmatter (byte-preserving raw block + typed data).
 * Every markdown doc is edited by the CodeMirror MarkdownEditor (DEC-010).
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
  };
}

/** Lowercased extension without the dot (e.g. "md"), or "" when none. */
export function extOf(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot + 1).toLowerCase();
}
