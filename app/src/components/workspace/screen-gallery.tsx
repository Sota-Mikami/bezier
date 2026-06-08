"use client";

// v0.3 — Gallery (grid) view of all Canvas screens.
// Renders the same screens as the Canvas, but as scaled-down, non-interactive
// live <ScreenFrame> thumbnails in a responsive grid. Clicking a tile calls
// onSelect(id); a remove control (if onRemove provided) deletes the screen.
//
// Thumbnails: each ScreenFrame is rendered at its native screen.w x screen.h
// and shrunk via CSS `transform: scale(...)` so the live frame keeps its real
// aspect/layout instead of being squished by the grid cell.

import { useMemo } from "react";

import ScreenFrame from "@/components/workspace/screen-frame";
import { Button } from "@/components/ui/button";
import type { Screen } from "@/lib/screens";
import { cn } from "@/lib/utils";

export interface ScreenGalleryProps {
  screens: Screen[];
  onSelect?: (id: string) => void;
  onRemove?: (id: string) => void;
}

// Width (px) of the thumbnail viewport. Height is derived per-screen from its
// aspect ratio so portrait/landscape frames both read correctly.
const THUMB_W = 280;

export default function ScreenGallery({
  screens,
  onSelect,
  onRemove,
}: ScreenGalleryProps) {
  if (screens.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center p-8 text-sm text-muted-foreground">
        No screens yet. Add one to populate the gallery.
      </div>
    );
  }

  return (
    <div
      className="grid gap-4 p-4"
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(${THUMB_W}px, 1fr))`,
      }}
    >
      {screens.map((screen) => (
        <GalleryTile
          key={screen.id}
          screen={screen}
          onSelect={onSelect}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}

function GalleryTile({
  screen,
  onSelect,
  onRemove,
}: {
  screen: Screen;
  onSelect?: (id: string) => void;
  onRemove?: (id: string) => void;
}) {
  // Guard against zero/negative dimensions in the SoR.
  const w = screen.w > 0 ? screen.w : THUMB_W;
  const h = screen.h > 0 ? screen.h : Math.round(THUMB_W * 1.5);

  const { scale, thumbH } = useMemo(() => {
    const s = THUMB_W / w;
    return { scale: s, thumbH: Math.round(h * s) };
  }, [w, h]);

  return (
    <div className="group flex flex-col gap-2">
      <button
        type="button"
        onClick={() => onSelect?.(screen.id)}
        className={cn(
          "relative block w-full overflow-hidden rounded-md border bg-background text-left",
          "ring-offset-background transition-shadow hover:shadow-md",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        )}
        style={{ height: thumbH }}
        aria-label={`Open ${screen.label}`}
      >
        {/* Scaled live frame. The inner box is rendered at native size then
            shrunk; a transparent overlay (ScreenFrame interactive={false})
            keeps the thumbnail from capturing iframe pointer events. */}
        <div
          className="pointer-events-none absolute left-0 top-0 origin-top-left"
          style={{
            width: w,
            height: h,
            transform: `scale(${scale})`,
          }}
        >
          <ScreenFrame screen={screen} interactive={false} />
        </div>
      </button>

      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" title={screen.label}>
            {screen.label}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {screen.source.type}
          </p>
        </div>
        {onRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="opacity-0 transition-opacity group-hover:opacity-100"
            onClick={() => onRemove(screen.id)}
            aria-label={`Remove ${screen.label}`}
          >
            Remove
          </Button>
        ) : null}
      </div>
    </div>
  );
}
