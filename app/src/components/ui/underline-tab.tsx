"use client";

// A Facebook-style tab (DEC-065): the ACTIVE tab is identified by color
// (foreground) + an underline bar; INACTIVE tabs show a rounded gray "pill" on
// hover. Shared so every horizontal tab row (Implement's Preview/Diff/Code, the
// Design candidate tabs) looks identical instead of bespoke.
//
// It's a <div role="tab"> (not a <button>) so callers can nest interactive bits
// — a close ×, a badge — inside it without invalid button-in-button nesting.

import * as React from "react";
import { cn } from "@/lib/utils";

export function UnderlineTab({
  active,
  onClick,
  onAuxClick,
  title,
  className,
  children,
}: {
  active: boolean;
  onClick?: () => void;
  onAuxClick?: (e: React.MouseEvent) => void;
  title?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="tab"
      aria-selected={active}
      tabIndex={0}
      title={title}
      onClick={onClick}
      onAuxClick={onAuxClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={cn(
        "group/tab relative flex h-9 shrink-0 cursor-pointer items-center px-0.5 outline-none select-none",
        className,
      )}
    >
      <span
        className={cn(
          "flex min-w-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
          active
            ? "text-foreground"
            : "text-muted-foreground group-hover/tab:bg-muted group-hover/tab:text-foreground",
        )}
      >
        {children}
      </span>
      {/* Active underline — sits on the row's bottom border. */}
      {active && (
        <span
          aria-hidden
          className="absolute inset-x-2.5 bottom-0 h-0.5 rounded-full bg-foreground"
        />
      )}
    </div>
  );
}

export default UnderlineTab;
