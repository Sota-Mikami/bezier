"use client";

// Edit ⊻ Comment — the two mutually-exclusive ways to act on a rendered surface
// (the HTML mock OR the live Preview). Before this they were two mismatched buttons
// in two different places (Edit in the preview toolbar / mock strip, Comment a
// separate bordered pill in the tab bar) that even shared the same Pencil icon. Now
// one segmented control with distinct icons (SquarePen = edit styles, MessageSquare
// = leave a comment for the agent), co-located, used by both surfaces.
//
// Mutual exclusion is handled here: while commenting, Edit is disabled; while
// editing, the surface locks annotation (so `locked` from useAnnotationMode disables
// Comment). The surface owns the Edit toggle (its engine differs) + passes it in.

import * as React from "react";
import { SquarePen, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { useAnnotationMode } from "./annotation-mode";

export function ModeToggleGroup({
  editing,
  onToggleEdit,
  editDisabled = false,
  editLabel,
  editTip,
  size = "sm",
}: {
  editing: boolean;
  onToggleEdit: () => void;
  /** Surface-specific reason Edit can't run (e.g. no html yet). Commenting also
   *  disables Edit automatically. */
  editDisabled?: boolean;
  editLabel: string;
  editTip?: string;
  size?: "sm" | "xs";
}) {
  const t = useT();
  const { on: commenting, toggle: toggleComment, locked: commentLocked } = useAnnotationMode();

  const h = size === "xs" ? "h-6" : "h-7";
  const text = size === "xs" ? "text-[11px]" : "text-xs";
  const ic = size === "xs" ? "size-3" : "size-3.5";

  const seg = (
    active: boolean,
    disabled: boolean,
    onClick: () => void,
    Icon: typeof SquarePen,
    label: string,
    tip: string | undefined,
  ) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      title={tip}
      className={cn(
        "flex shrink-0 items-center gap-1 rounded px-2 font-medium transition-colors",
        h,
        text,
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
        disabled && "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-muted-foreground",
      )}
    >
      <Icon className={cn(ic, "shrink-0")} />
      {label}
    </button>
  );

  return (
    <div className="flex shrink-0 items-center gap-0.5 rounded-md border p-0.5">
      {seg(editing, editDisabled || commenting, onToggleEdit, SquarePen, editLabel, editTip)}
      {seg(
        commenting,
        commentLocked,
        toggleComment,
        MessageSquare,
        t("topbar.annotate"),
        commentLocked ? t("topbar.annotateLocked") : t("topbar.annotateTitle"),
      )}
    </div>
  );
}
