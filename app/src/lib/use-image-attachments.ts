// Shared hook for image attachments across Bezier surfaces (TQ-2 / DEC-150).
// Manages a list of staged images in memory (object URLs as thumbnails) that can
// be materialised to disk by the caller. Used by:
//   - NewIssueModal (images converted to PendingImageBlob → pending-start registry)
//   - design-annotations.tsx Composer (images materialised on send)
// The terminal (terminal.tsx) has its own disk-on-paste flow and does NOT use
// this hook — its PendingAttachment shape is compatible with AttachmentItem.

import * as React from "react";

export const IMG_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
  "image/tiff": "tiff",
};

export interface ImageBlob {
  id: string;
  name: string;
  blob: Blob;
  mime: string;
  /** Object URL for the thumbnail; revoked on remove / clear / unmount. */
  thumbUrl: string;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useImageAttachments() {
  const [blobs, setBlobs] = React.useState<ImageBlob[]>([]);

  // Revoke all object URLs on unmount.
  React.useEffect(() => {
    return () => {
      setBlobs((cur) => {
        cur.forEach((b) => URL.revokeObjectURL(b.thumbUrl));
        return [];
      });
    };
  }, []);

  const addBlob = React.useCallback((blob: Blob, mime: string, name: string) => {
    if (!(mime in IMG_EXT)) return;
    setBlobs((cur) => [
      ...cur,
      {
        id: makeId(),
        name,
        blob,
        mime,
        thumbUrl: URL.createObjectURL(blob),
      },
    ]);
  }, []);

  const addFiles = React.useCallback(
    (files: File[]) => {
      files
        .filter((f) => f.type in IMG_EXT)
        .forEach((f) => addBlob(f, f.type, f.name));
    },
    [addBlob],
  );

  const remove = React.useCallback((id: string) => {
    setBlobs((cur) => {
      const entry = cur.find((b) => b.id === id);
      if (entry) URL.revokeObjectURL(entry.thumbUrl);
      return cur.filter((b) => b.id !== id);
    });
  }, []);

  const clear = React.useCallback(() => {
    setBlobs((cur) => {
      cur.forEach((b) => URL.revokeObjectURL(b.thumbUrl));
      return [];
    });
  }, []);

  /** Pull images out of a DataTransfer (paste / drop event). */
  const fromDataTransfer = React.useCallback(
    (dt: DataTransfer) => {
      const files = Array.from(dt.files ?? []);
      if (files.length > 0) {
        addFiles(files);
        return;
      }
      // Fallback: clipboard items (e.g. screenshot pasted from macOS).
      for (const item of Array.from(dt.items ?? [])) {
        if (item.kind === "file" && item.type in IMG_EXT) {
          const f = item.getAsFile();
          if (f) {
            const ext = IMG_EXT[item.type] ?? "png";
            addBlob(f, item.type, `pasted-${Date.now()}.${ext}`);
          }
        }
      }
    },
    [addFiles, addBlob],
  );

  return { blobs, addFiles, addBlob, remove, clear, fromDataTransfer };
}
