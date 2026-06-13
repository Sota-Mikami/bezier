"use client";

// A macOS/iOS-style segmented control (DEC-058). One rounded track holds the
// segments; a single "thumb" surface SLIDES under the active one (natural
// motion, bézier easing) rather than snapping. The thumb is positioned
// imperatively from the active button's measured offset/width (handles segments
// of different widths), so there's no per-render state. Shared so every
// "pick one of N views" row (e.g. the center Spec/Design/Implement switcher)
// looks identical instead of bespoke button rows.

import * as React from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  /** Optional trailing adornment (e.g. an "updating" pulse dot). */
  trailing?: React.ReactNode;
  title?: string;
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: SegmentedOption<T>[];
  className?: string;
  ariaLabel?: string;
}) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const thumbRef = React.useRef<HTMLDivElement>(null);
  const btnRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  // Slide the thumb under the active segment (imperative — no setState in effect).
  const positionThumb = React.useCallback(() => {
    const idx = options.findIndex((o) => o.value === value);
    const btn = btnRefs.current[idx];
    const thumb = thumbRef.current;
    if (!thumb) return;
    if (!btn) {
      thumb.style.opacity = "0";
      return;
    }
    thumb.style.opacity = "1";
    thumb.style.left = `${btn.offsetLeft}px`;
    thumb.style.width = `${btn.offsetWidth}px`;
  }, [value, options]);

  React.useLayoutEffect(() => {
    positionThumb();
  }, [positionThumb]);

  React.useEffect(() => {
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => positionThumb());
    ro.observe(track);
    return () => ro.disconnect();
  }, [positionThumb]);

  return (
    <div
      ref={trackRef}
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "relative inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5",
        className,
      )}
    >
      {/* Sliding thumb (behind the labels). */}
      <div
        ref={thumbRef}
        aria-hidden
        className="pointer-events-none absolute bottom-0.5 top-0.5 left-0.5 rounded-md bg-background shadow-sm transition-[left,width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
        style={{ width: 0 }}
      />
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              btnRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            title={opt.title}
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative z-10 inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.icon}
            {opt.label}
            {opt.trailing}
          </button>
        );
      })}
    </div>
  );
}

export default SegmentedControl;
