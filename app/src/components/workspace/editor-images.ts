// Image support for the markdown CodeMirror editor (Notion-like).
//
// Storage model (see the issue spec): the markdown TEXT stays the source of
// truth and only ever holds a RELATIVE link `![alt](assets/img-<hash>.<ext>)`.
// The bytes live co-located next to spec.md at `<issue>/assets/img-<hash>.<ext>`
// so they travel with the issue folder (repo-as-SoR, DEC-008) and never bloat
// the markdown. Rendering (markdown-live-preview.ts) lazily reads the bytes back
// into a blob URL at draw time — the heavy bytes never touch the doc text.
//
// Three input paths, all funnelling through `insertImage`:
//   • `/image` slash command → native file picker (pickAndInsertImage)
//   • paste (⌘V) of a clipboard image
//   • drag & drop of image file(s)
//
// The spec.md path is threaded into the editor via `specPathFacet` so the save
// target (its `assets/` sibling) and the render-time path resolution can be
// computed from any EditorView / EditorState.

import { Facet } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { open } from "@tauri-apps/plugin-dialog";

import { readBinaryFile, writeBinaryFile } from "@/lib/ipc";

/**
 * The absolute path of the document being edited (spec.md). Configured once at
 * editor mount; read by the paste/drop handlers, the `/image` command, and the
 * render-time image widget. Empty string when unknown (renders are skipped).
 */
export const specPathFacet = Facet.define<string, string>({
  combine: (values) => values[0] ?? "",
});

/** Directory portion of an absolute POSIX path (no trailing slash). */
function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

/** Map an image MIME type / filename to a sane file extension. */
function extFor(mime: string, filename?: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    case "image/svg+xml":
      return "svg";
    case "image/avif":
      return "avif";
    case "image/bmp":
      return "bmp";
  }
  const m = filename?.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : "png";
}

/** MIME type for a known image extension (used to rebuild a Blob for render). */
function mimeFor(ext: string): string {
  switch (ext.toLowerCase()) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "avif":
      return "image/avif";
    case "bmp":
      return "image/bmp";
    default:
      return "application/octet-stream";
  }
}

/** Content-address the bytes: first 16 hex of SHA-256 → stable, dedupe-friendly. */
async function hashBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  const view = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < 8; i++) hex += view[i].toString(16).padStart(2, "0");
  return hex;
}

/**
 * Persist image bytes co-located with spec.md and return the RELATIVE markdown
 * link path (`assets/img-<hash>.<ext>`). Content-addressed, so re-pasting the
 * same image converges on one file. No-op write cost is acceptable (small).
 */
export async function saveImageAsset(
  specPath: string,
  bytes: Uint8Array,
  mime: string,
  filename?: string,
): Promise<string> {
  const ext = extFor(mime, filename);
  const hash = await hashBytes(bytes);
  const rel = `assets/img-${hash}.${ext}`;
  const abs = `${dirname(specPath)}/${rel}`;
  await writeBinaryFile(abs, bytes);
  return rel;
}

// --- Render-time blob-URL cache ------------------------------------------
// Keyed by absolute path. Reading the same asset across re-renders (every
// transaction recomputes the preview) returns the cached blob URL, so the file
// is read once. Blob URLs intentionally outlive the editor (small, bounded set
// per session); we don't revoke since the widget DOM is reused via WidgetType.eq.
const blobUrlCache = new Map<string, Promise<string>>();

/** Is this an external/self-contained src we can hand to <img> verbatim? */
export function isExternalSrc(url: string): boolean {
  return /^(https?:|data:|blob:)/i.test(url);
}

/** Resolve a markdown image url to an absolute on-disk path (relative → abs). */
export function resolveImagePath(specPath: string, url: string): string {
  if (url.startsWith("/")) return url; // already absolute
  return `${dirname(specPath)}/${url}`;
}

/**
 * Lazily load a local image asset as a blob URL (cached by absolute path).
 * External srcs (http/data/blob) are returned unchanged.
 */
export function loadImageSrc(specPath: string, url: string): Promise<string> {
  if (isExternalSrc(url)) return Promise.resolve(url);
  const abs = resolveImagePath(specPath, url);
  const cached = blobUrlCache.get(abs);
  if (cached) return cached;
  const ext = (abs.match(/\.([a-z0-9]+)$/i)?.[1] ?? "png").toLowerCase();
  const p = readBinaryFile(abs).then((bytes) => {
    const blob = new Blob([bytes as BlobPart], { type: mimeFor(ext) });
    return URL.createObjectURL(blob);
  });
  blobUrlCache.set(abs, p);
  // Drop failed reads from the cache so a later (e.g. just-written) file retries.
  p.catch(() => blobUrlCache.delete(abs));
  return p;
}

// --- Insertion ------------------------------------------------------------

/** Insert `![alt](rel)` on its own line at the caret and place the caret after. */
function insertImageMarkdown(view: EditorView, rel: string, alt: string): void {
  const sel = view.state.selection.main;
  const line = view.state.doc.lineAt(sel.from);
  const atLineStart = sel.from === line.from;
  const text = `${atLineStart ? "" : "\n"}![${alt}](${rel})\n`;
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: text },
    selection: { anchor: sel.from + text.length },
    scrollIntoView: true,
    userEvent: "input.complete",
  });
}

/** Save one image blob + insert its link. Alt defaults to the file's basename. */
async function insertImage(
  view: EditorView,
  bytes: Uint8Array,
  mime: string,
  filename?: string,
): Promise<void> {
  const specPath = view.state.facet(specPathFacet);
  if (!specPath) return;
  const rel = await saveImageAsset(specPath, bytes, mime, filename);
  const alt = filename ? filename.replace(/\.[a-z0-9]+$/i, "") : "";
  insertImageMarkdown(view, rel, alt);
}

/** Pull image File objects out of a clipboard/drop transfer. */
function imageFilesFrom(list: FileList | null | undefined): File[] {
  if (!list) return [];
  return Array.from(list).filter((f) => f.type.startsWith("image/"));
}

async function handleFiles(view: EditorView, files: File[]): Promise<void> {
  for (const file of files) {
    try {
      const buf = await file.arrayBuffer();
      await insertImage(view, new Uint8Array(buf), file.type, file.name || undefined);
    } catch (err) {
      console.error("continuum: image paste/drop failed", err);
    }
  }
}

/**
 * CodeMirror extension: intercept paste & drop of image files, save them as
 * co-located assets, and insert the markdown link. Non-image paste/drop falls
 * through to CM's default text handling (returns false).
 */
export const imageInputHandlers = EditorView.domEventHandlers({
  // A file drag must be preventDefault-ed on dragover, else the OS/webview
  // "opens" the dropped file instead of firing our drop handler.
  dragover(event) {
    if (event.dataTransfer?.types?.includes("Files")) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      return true;
    }
    return false;
  },
  paste(event, view) {
    // Clipboard images surface as `items` of kind "file"; collect those.
    const items = event.clipboardData?.items;
    if (!items) return false;
    const files: File[] = [];
    for (const it of Array.from(items)) {
      if (it.kind === "file" && it.type.startsWith("image/")) {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length === 0) return false;
    event.preventDefault();
    void handleFiles(view, files);
    return true;
  },
  drop(event, view) {
    const files = imageFilesFrom(event.dataTransfer?.files);
    if (files.length === 0) return false;
    event.preventDefault();
    // Place the caret where the drop landed before inserting.
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos != null) {
      view.dispatch({ selection: { anchor: pos } });
    }
    void handleFiles(view, files);
    return true;
  },
});

/**
 * Open the native file picker and insert the chosen image(s). Used by the
 * `/image` slash command. Reads the picked path's bytes via the binary IPC so
 * it goes through the SAME save+insert path as paste/drop.
 */
export async function pickAndInsertImage(view: EditorView): Promise<void> {
  const specPath = view.state.facet(specPathFacet);
  if (!specPath) return;
  let selected: string | string[] | null;
  try {
    selected = await open({
      multiple: true,
      filters: [
        {
          name: "Image",
          extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp"],
        },
      ],
    });
  } catch (err) {
    console.error("continuum: image picker failed", err);
    return;
  }
  if (selected == null) return;
  const paths = Array.isArray(selected) ? selected : [selected];
  for (const p of paths) {
    try {
      const bytes = await readBinaryFile(p);
      const name = p.slice(p.lastIndexOf("/") + 1);
      const ext = name.match(/\.([a-z0-9]+)$/i)?.[1] ?? "png";
      await insertImage(view, bytes, mimeFor(ext), name);
    } catch (err) {
      console.error("continuum: image insert failed", err);
    }
  }
}
