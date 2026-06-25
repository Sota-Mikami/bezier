"use client";

// Shared attachment tray for image previews (TQ-2 / DEC-150).
// Used in: NewIssueModal, design-annotations.tsx Composer.
// The terminal (terminal.tsx) has its own disk-based inline tray and does NOT
// use this component — its PendingAttachment shape is compatible with
// AttachmentItem so the lightbox can still receive it.

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { tt } from "@/lib/i18n";

export interface AttachmentItem {
  id: string;
  name: string;
  thumbUrl: string;
}

interface AttachmentTrayProps {
  items: AttachmentItem[];
  onRemove: (id: string) => void;
  /** Optional: clicking a thumbnail opens the lightbox at this item. */
  onOpen?: (id: string) => void;
  className?: string;
}

export function AttachmentTray({
  items,
  onRemove,
  onOpen,
  className,
}: AttachmentTrayProps) {
  if (items.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {items.map((item) => (
        <div
          key={item.id}
          className="group relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- local object: blob URL in Tauri webview */}
          <img
            src={item.thumbUrl}
            alt={tt("chatAttach.imageAlt", { name: item.name })}
            className={cn("size-full object-cover", onOpen && "cursor-pointer")}
            onClick={() => onOpen?.(item.id)}
            title={item.name}
          />
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            title={tt("chatAttach.remove")}
            aria-label={tt("chatAttach.remove")}
            className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 transition-opacity group-hover:opacity-100"
          >
            <X className="size-2.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
