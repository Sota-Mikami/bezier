// Spec image insertion (DEC-043 / DEC-044). Shared by the markdown editor's
// paste/drop handlers and the "/Image" slash command. Images are saved next to
// the doc under `assets/<name>` and a `![](assets/<name>)` reference is inserted
// at the caret; the live preview renders them inline (markdown-live-preview.ts).

import type { EditorView } from "@codemirror/view";
import { writeFileBytes, readFileBytes, messageDialog, pickImageFiles } from "@/lib/ipc";
import { tt } from "@/lib/i18n";

/** Directory portion of an absolute file path ("" when none). */
export function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i > 0 ? path.slice(0, i) : "";
}

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/avif": "avif",
  "image/bmp": "bmp",
};

/** Extension for an image from its MIME type, then its filename, then png. */
function extFor(name: string, mime: string): string {
  return MIME_EXT[mime] || name.split(".").pop()?.toLowerCase() || "png";
}

/** Filesystem-safe basename stem (pasted files are often just "image"). */
function stemFor(name: string): string {
  const stem = name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return stem.slice(0, 40) || "image";
}

/** True if a drag carries files (so we can offer a drop target during dragover,
 * where the file list itself is not yet readable). */
export function dragHasFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes("Files");
}

// A short, collision-resistant suffix. Date.now is fine in the app runtime.
function uniqueSuffix(): string {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
}

/**
 * Write image bytes under <baseDir>/assets/ and insert a markdown reference at
 * `pos`. Returns the caret position AFTER the inserted snippet (so a caller can
 * chain multiple inserts). On failure it surfaces a dialog and returns `pos`.
 */
async function writeAndInsert(
  view: EditorView,
  baseDir: string,
  bytes: Uint8Array,
  name: string,
  mime: string,
  pos: number,
): Promise<number> {
  try {
    const rel = `assets/${stemFor(name)}-${uniqueSuffix()}.${extFor(name, mime)}`;
    await writeFileBytes(`${baseDir}/${rel}`, bytes);
    const snippet = `![](${rel})`;
    view.dispatch({
      changes: { from: pos, insert: `${snippet}\n` },
      selection: { anchor: pos + snippet.length },
      scrollIntoView: true,
    });
    return pos + snippet.length + 1;
  } catch (e) {
    await messageDialog(
      tt("imageInsert.saveFailed", { msg: e instanceof Error ? e.message : String(e) }),
      { title: tt("imageInsert.errorTitle") },
    );
    return pos;
  }
}

/** Insert pasted/dropped image File objects (clipboard / drag-drop). */
export async function insertImageFiles(
  view: EditorView,
  baseDir: string,
  files: File[],
  atPos?: number,
): Promise<void> {
  if (!baseDir || files.length === 0) return;
  let pos = atPos ?? view.state.selection.main.head;
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    pos = await writeAndInsert(view, baseDir, bytes, file.name, file.type, pos);
  }
}

/**
 * Open the native image picker and insert the chosen file(s) (the "/Image"
 * slash command). Reads each picked file's bytes and copies them into the doc's
 * assets/ dir, so the reference is repo-local (not a fragile absolute path).
 */
export async function pickAndInsertImages(
  view: EditorView,
  baseDir: string,
  atPos?: number,
): Promise<void> {
  if (!baseDir) return;
  const paths = await pickImageFiles().catch(() => [] as string[]);
  if (paths.length === 0) return;
  let pos = atPos ?? view.state.selection.main.head;
  for (const p of paths) {
    try {
      const bytes = await readFileBytes(p);
      pos = await writeAndInsert(view, baseDir, bytes, p.split("/").pop() ?? "image.png", "", pos);
    } catch (e) {
      await messageDialog(
        tt("imageInsert.loadFailed", { msg: e instanceof Error ? e.message : String(e) }),
        { title: tt("imageInsert.errorTitle") },
      );
    }
  }
}
