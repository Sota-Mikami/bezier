"use client";

// v0.4 — Element inspector (Onlook-style style panel).
// Given the element selected in an editable preview (SelectedElement from the
// bridge), this renders an editor for its Tailwind classes (+ a read-only view
// of computed styles) and calls onApply(edit) so the parent can:
//   (a) push a live preview to the iframe, and
//   (b) persist the edit to source via lib/onlook-edit.applyEdit.
//
// This component owns NO file I/O — it is a controlled inspector. The parent
// wires onApply to the write-back path. It must be "use client" (DOM/state) and
// loaded via next/dynamic ssr:false where it is mounted (output:"export").

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type { SelectedElement, StyleEdit } from "@/lib/preview-bridge";
import { cn } from "@/lib/utils";

export interface ElementInspectorProps {
  /** The currently selected element, or null when nothing is selected. */
  selected: SelectedElement | null;
  /** Persist a class/style edit. Parent does live-preview + source write-back. */
  onApply: (edit: StyleEdit) => void | Promise<void>;
  /** Optional status surfaced from the parent's write-back (e.g. errors). */
  status?: { kind: "idle" | "saving" | "saved" | "error"; message?: string };
}

// Common Tailwind utilities offered as one-tap chips. Tapping appends to the
// working class string; tailwind-merge dedupes on persist.
const QUICK_CLASSES: { group: string; classes: string[] }[] = [
  { group: "Layout", classes: ["flex", "grid", "block", "hidden", "items-center", "justify-center", "gap-2", "gap-4"] },
  { group: "Spacing", classes: ["p-2", "p-4", "px-4", "py-2", "m-2", "mt-4"] },
  { group: "Text", classes: ["text-sm", "text-lg", "text-xl", "font-medium", "font-bold", "text-center"] },
  { group: "Color", classes: ["text-white", "text-black", "bg-white", "bg-black", "bg-primary", "rounded-md", "rounded-lg", "shadow"] },
];

export default function ElementInspector({
  selected,
  onApply,
  status,
}: ElementInspectorProps) {
  // Working copy of the class string; reset whenever the selection changes.
  // Uses the React "adjust state during render" pattern (not an effect) so the
  // draft re-syncs the moment a different element / className is selected.
  const selKey = `${selected?.domId ?? ""}::${selected?.className ?? ""}`;
  const [draft, setDraft] = useState(selected?.className ?? "");
  const [override, setOverride] = useState(false);
  const [prevSelKey, setPrevSelKey] = useState(selKey);
  if (selKey !== prevSelKey) {
    setPrevSelKey(selKey);
    setDraft(selected?.className ?? "");
    setOverride(false);
  }

  if (!selected) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-4 text-center">
        <span className="text-sm font-medium text-muted-foreground">
          No element selected
        </span>
        <span className="text-xs text-muted-foreground">
          Click an element in the editable preview to inspect it.
        </span>
      </div>
    );
  }

  const notInstrumented = selected.oid == null;

  function appendClass(c: string) {
    setDraft((prev) => {
      const parts = prev.split(/\s+/).filter(Boolean);
      if (parts.includes(c)) return prev; // simple toggle-guard; merge handles real dedupe
      return [...parts, c].join(" ");
    });
  }

  function handleApply() {
    onApply({ className: draft.trim(), override });
  }

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header: tag + oid */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Badge variant="secondary" className="shrink-0 font-mono text-[10px]">
            {selected.tagName.toLowerCase()}
          </Badge>
          <span
            className="truncate font-mono text-[10px] text-muted-foreground"
            title={selected.oid ?? "(no data-oid)"}
          >
            {selected.oid ?? "no data-oid"}
          </span>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-3">
          {notInstrumented && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              This element has no <code className="font-mono">data-oid</code>. Live
              edits will preview but cannot be written back to source until the
              repo is instrumented (see Setup).
            </div>
          )}

          {/* className editor */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="ei-classname"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Tailwind classes
              </label>
              <label className="flex cursor-pointer items-center gap-1 text-[10px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={override}
                  onChange={(e) => setOverride(e.target.checked)}
                  className="h-3 w-3"
                />
                replace all
              </label>
            </div>
            <Textarea
              id="ei-classname"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
              rows={3}
              className="font-mono text-xs"
              placeholder="flex items-center gap-2 …"
            />
          </section>

          {/* Quick chips */}
          <section className="flex flex-col gap-2">
            {QUICK_CLASSES.map((row) => (
              <div key={row.group} className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {row.group}
                </span>
                <div className="flex flex-wrap gap-1">
                  {row.classes.map((c) => {
                    const active = draft.split(/\s+/).includes(c);
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => appendClass(c)}
                        className={cn(
                          "rounded border px-1.5 py-0.5 font-mono text-[10px] transition-colors",
                          active
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {c}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>

          <Separator />

          {/* Computed styles (read-only) */}
          <section className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Computed
            </span>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
              {Object.entries(selected.computedStyles).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="font-mono text-muted-foreground">{k}</dt>
                  <dd className="truncate font-mono" title={v}>
                    {v}
                  </dd>
                </div>
              ))}
              {Object.keys(selected.computedStyles).length === 0 && (
                <span className="text-muted-foreground">No computed styles.</span>
              )}
            </dl>
          </section>
        </div>
      </ScrollArea>

      {/* Footer: apply + status */}
      <div className="flex shrink-0 flex-col gap-2 border-t bg-muted/30 px-3 py-2">
        {status && status.kind !== "idle" && (
          <span
            className={cn(
              "truncate text-[11px]",
              status.kind === "error"
                ? "text-destructive"
                : status.kind === "saved"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-muted-foreground",
            )}
          >
            {status.kind === "saving"
              ? "Saving…"
              : status.kind === "saved"
                ? (status.message ?? "Saved to source")
                : (status.message ?? "Write-back failed")}
          </span>
        )}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="flex-1"
            onClick={handleApply}
            disabled={status?.kind === "saving"}
          >
            Apply
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setDraft(selected.className)}
          >
            Reset
          </Button>
        </div>
      </div>
    </div>
  );
}
