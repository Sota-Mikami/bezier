"use client";

// Full-screen image lightbox for attachment preview (DEC-150).
// Keyboard: Escape closes; ArrowLeft / ArrowRight navigates multi-image sets.

import * as React from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { tt } from "@/lib/i18n";
import type { AttachmentItem } from "./attachment-tray";

interface ImageLightboxProps {
  items: AttachmentItem[];
  /** null = closed. */
  index: number | null;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export function ImageLightbox({
  items,
  index,
  onClose,
  onNavigate,
}: ImageLightboxProps) {
  React.useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      } else if (e.key === "ArrowLeft") {
        onNavigate(Math.max(0, index - 1));
      } else if (e.key === "ArrowRight") {
        onNavigate(Math.min(items.length - 1, index + 1));
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [index, items.length, onClose, onNavigate]);

  if (index === null || index < 0 || index >= items.length) return null;
  const item = items[index]!;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={tt("chatAttach.openPreview")}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        title={tt("chatAttach.lightboxClose")}
        aria-label={tt("chatAttach.lightboxClose")}
        className="absolute right-4 top-4 flex size-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        <X className="size-4" />
      </button>

      {items.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onNavigate(Math.max(0, index - 1));
            }}
            disabled={index === 0}
            title={tt("chatAttach.prevImage")}
            aria-label={tt("chatAttach.prevImage")}
            className="absolute left-4 top-1/2 -translate-y-1/2 flex size-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onNavigate(Math.min(items.length - 1, index + 1));
            }}
            disabled={index === items.length - 1}
            title={tt("chatAttach.nextImage")}
            aria-label={tt("chatAttach.nextImage")}
            className="absolute right-4 top-1/2 -translate-y-1/2 flex size-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30"
          >
            <ChevronRight className="size-5" />
          </button>
        </>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element -- local object: blob URL in Tauri webview */}
      <img
        src={item.thumbUrl}
        alt={tt("chatAttach.imageAlt", { name: item.name })}
        className="max-h-[90vh] max-w-[90vw] object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
