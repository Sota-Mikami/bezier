// Image embedding for the Markdown editor (issue 01KTWV4SMA4C6WDA9DEY36H1KP).
//
// Pasted / dropped images are saved as files in an `assets/` folder beside the
// document (spec.md) and referenced with a RELATIVE path: `![](assets/<id>.png)`.
// Relative so the image travels with spec.md (the agent reads it via --add-dir).
//
// The Tauri webview cannot load a raw local path from an `<img src>`, so for
// rendering we read the bytes back over IPC and build a `data:` URL. http(s)/
// data sources pass through untouched.

import { ulid } from "ulid";
import { writeFileBase64, readFileBase64 } from "@/lib/ipc";

/** Subfolder (relative to the document) where embedded images are stored. */
const ASSETS_DIR = "assets";

/** Extension to use for a given image MIME type. */
const EXT_FOR_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
  "image/avif": "avif",
};

/** MIME type to advertise in a `data:` URL for a given file extension. */
const MIME_FOR_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  avif: "image/avif",
};

/** Directory portion of an absolute file path (no trailing slash). */
export function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i >= 0 ? path.slice(0, i) : "";
}

/** Whether a File/clipboard item is an image we can embed. */
export function isImageFile(file: File | null | undefined): file is File {
  return !!file && file.type.startsWith("image/");
}

/** Read a File as base64 (no `data:` prefix) for the binary-write command. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.onload = () => {
      const result = String(reader.result);
      // result is `data:<mime>;base64,<payload>` — keep only the payload.
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Save an image File beside the document and return the RELATIVE markdown path
 * (`assets/<ulid>.<ext>`) to reference it with. `baseDir` is the document's
 * absolute directory.
 */
export async function saveImageToAssets(
  baseDir: string,
  file: File,
): Promise<string> {
  const ext =
    EXT_FOR_MIME[file.type] ||
    file.name.split(".").pop()?.toLowerCase() ||
    "png";
  const rel = `${ASSETS_DIR}/${ulid()}.${ext}`;
  const base64 = await fileToBase64(file);
  await writeFileBase64(`${baseDir}/${rel}`, base64);
  return rel;
}

// Cache resolved sources -> data URL (or null when unreadable) so re-renders of
// the same image don't re-read the file. Keyed by the resolved absolute path (or
// the passthrough URL itself).
const loadCache = new Map<string, Promise<string | null>>();

/**
 * Resolve a markdown image `src` to something an `<img>` can display. Absolute
 * http(s)/data URLs pass through; everything else is treated as a path relative
 * to `baseDir`, read over IPC, and returned as a `data:` URL. Cached per source.
 */
export function loadImageSrc(
  baseDir: string,
  src: string,
): Promise<string | null> {
  const trimmed = src.trim();
  if (/^(https?:|data:)/i.test(trimmed)) return Promise.resolve(trimmed);

  const abs = trimmed.startsWith("/") ? trimmed : `${baseDir}/${trimmed}`;
  const cached = loadCache.get(abs);
  if (cached) return cached;

  const ext = abs.split(".").pop()?.toLowerCase() ?? "";
  const mime = MIME_FOR_EXT[ext] ?? "image/png";
  const promise = readFileBase64(abs)
    .then((b64) => `data:${mime};base64,${b64}`)
    .catch(() => null);
  loadCache.set(abs, promise);
  return promise;
}
