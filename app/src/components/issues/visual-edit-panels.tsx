"use client";

// Visual-edit panels (DEC-131): Layer panel (left) + Style panel (right) + pending
// bar that wrap the embedded webview while Edit mode is on. Driven by useVisualEdit.
// Aiming at a Figma-like feel: number fields support ↑/↓ (Shift ×10, Alt ×0.1) +
// drag-scrub, enums are dropdowns, flex/position fields appear conditionally, and the
// Layer panel reorders direct children by drag. Structural depth (full DOM tree, text
// editing, multi-select, token governance) is tracked for later in the spec.

import * as React from "react";
import {
  MousePointerSquareDashed,
  ChevronUp,
  CornerDownRight,
  Loader2,
  Undo2,
  RotateCcw,
  GripVertical,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { ElBrief, VisualEdit } from "./use-visual-edit";

function briefLabel(b: ElBrief): string {
  const cls = b.classes.length ? "." + b.classes.slice(0, 2).join(".") : "";
  return b.tag + cls;
}

/** rgb()/rgba()/hex → #rrggbb for <input type=color>; "#000000" on failure. */
function toHex(v: string): string {
  if (!v) return "#000000";
  const s = v.trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s;
  const m = s.match(/rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/i);
  if (!m) return "#000000";
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return "#" + h(+m[1]) + h(+m[2]) + h(+m[3]);
}

/** Step a numeric CSS value (keeps the unit). null if not numeric (e.g. "auto"). */
function stepValue(raw: string, delta: number): string | null {
  const m = raw.trim().match(/^(-?\d*\.?\d+)([a-z%]*)$/i);
  if (!m) return null;
  const next = Math.round((parseFloat(m[1]) + delta) * 1000) / 1000;
  return `${next}${m[2] || ""}`;
}

type FieldKind = "number" | "color" | "select" | "text";
interface Field {
  prop: string;
  label: string;
  kind: FieldKind;
  options?: string[];
}

const SELECT = (prop: string, label: string, options: string[]): Field => ({
  prop,
  label,
  kind: "select",
  options,
});
const NUM = (prop: string, label: string): Field => ({ prop, label, kind: "number" });

// Conditional groups are computed per selection (flex children, position offsets).
function groupsFor(display: string, position: string): { label: string; fields: Field[] }[] {
  const isFlex = display === "flex" || display === "inline-flex";
  const positioned = position !== "static" && position !== "";
  return [
    {
      label: "Layout",
      fields: [
        SELECT("display", "display", [
          "block",
          "flex",
          "inline-flex",
          "grid",
          "inline-block",
          "inline",
          "none",
        ]),
        ...(isFlex
          ? [
              SELECT("flex-direction", "direction", ["row", "column", "row-reverse", "column-reverse"]),
              SELECT("justify-content", "justify", [
                "flex-start",
                "center",
                "flex-end",
                "space-between",
                "space-around",
                "space-evenly",
              ]),
              SELECT("align-items", "align", ["stretch", "flex-start", "center", "flex-end", "baseline"]),
              NUM("gap", "gap"),
            ]
          : []),
        NUM("flex-grow", "grow"),
        SELECT("align-self", "self", ["auto", "stretch", "flex-start", "center", "flex-end"]),
      ],
    },
    {
      label: "Spacing",
      fields: [
        NUM("padding-top", "pad ↑"),
        NUM("padding-right", "pad →"),
        NUM("padding-bottom", "pad ↓"),
        NUM("padding-left", "pad ←"),
        NUM("margin-top", "mar ↑"),
        NUM("margin-right", "mar →"),
        NUM("margin-bottom", "mar ↓"),
        NUM("margin-left", "mar ←"),
      ],
    },
    { label: "Size", fields: [NUM("width", "W"), NUM("height", "H")] },
    {
      label: "Type",
      fields: [
        NUM("font-size", "size"),
        NUM("font-weight", "weight"),
        { prop: "line-height", label: "leading", kind: "text" },
        NUM("letter-spacing", "spacing"),
        SELECT("text-align", "align", ["left", "center", "right", "justify"]),
        { prop: "color", label: "color", kind: "color" },
      ],
    },
    {
      label: "Appearance",
      fields: [
        { prop: "background-color", label: "bg", kind: "color" },
        NUM("border-width", "border"),
        SELECT("border-style", "style", ["none", "solid", "dashed", "dotted"]),
        { prop: "border-color", label: "b-color", kind: "color" },
        NUM("border-radius", "radius"),
        { prop: "box-shadow", label: "shadow", kind: "text" },
        NUM("opacity", "opacity"),
      ],
    },
    {
      label: "Position",
      fields: [
        SELECT("position", "position", ["static", "relative", "absolute", "fixed", "sticky"]),
        ...(positioned
          ? [NUM("top", "top"), NUM("right", "right"), NUM("bottom", "bottom"), NUM("left", "left"), NUM("z-index", "z")]
          : []),
        SELECT("overflow", "overflow", ["visible", "hidden", "scroll", "auto"]),
      ],
    },
  ];
}

const fieldCls =
  "h-6 min-w-0 flex-1 rounded-md border bg-transparent px-1.5 font-mono text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-ring";

function NumberField({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  // ↑/↓ nudge the numeric value (keeping its unit); Shift ×10, Alt ×0.1 — Figma feel.
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const dir = e.key === "ArrowUp" ? 1 : e.key === "ArrowDown" ? -1 : 0;
    if (!dir) return;
    const mult = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
    const next = stepValue(value, dir * mult);
    if (next !== null) {
      e.preventDefault();
      onCommit(next);
    }
  };
  return (
    <input
      value={value}
      onChange={(e) => onCommit(e.target.value)}
      onKeyDown={onKeyDown}
      spellCheck={false}
      inputMode="decimal"
      className={fieldCls}
    />
  );
}

function StyleField({ f, vedit }: { f: Field; vedit: VisualEdit }) {
  const sel = vedit.selected!;
  const val = vedit.overrides[f.prop] ?? sel.computed[f.prop] ?? "";
  const overridden = f.prop in vedit.overrides;
  const commit = (v: string) => vedit.applyStyle(f.prop, v);
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded px-1 py-0.5",
        overridden && "bg-secondary/60",
      )}
    >
      <span
        className={cn(
          "w-14 shrink-0 truncate text-[10px]",
          overridden ? "font-medium text-foreground" : "text-muted-foreground",
        )}
        title={f.prop}
      >
        {f.label}
      </span>
      {f.kind === "color" && (
        <input
          type="color"
          value={toHex(val)}
          onChange={(e) => commit(e.target.value)}
          className="size-5 shrink-0 cursor-pointer rounded border bg-transparent p-0"
        />
      )}
      {f.kind === "select" ? (
        <select value={val} onChange={(e) => commit(e.target.value)} className={fieldCls}>
          {!f.options!.includes(val) && <option value={val}>{val || "—"}</option>}
          {f.options!.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : f.kind === "number" ? (
        <NumberField value={val} onCommit={commit} />
      ) : (
        <input
          value={val}
          onChange={(e) => commit(e.target.value)}
          spellCheck={false}
          className={fieldCls}
        />
      )}
      <button
        type="button"
        onClick={() => vedit.resetProp(f.prop)}
        title="reset"
        className={cn(
          "shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground",
          overridden ? "visible" : "invisible",
        )}
      >
        <RotateCcw className="size-3" />
      </button>
    </div>
  );
}

export function EditStylePanel({ vedit }: { vedit: VisualEdit }) {
  const t = useT();
  const sel = vedit.selected;
  if (!sel) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
        <MousePointerSquareDashed className="size-5 text-muted-foreground" />
        <p className="text-[11px] text-muted-foreground">{t("edit.selectPrompt")}</p>
        <p className="text-[10px] text-muted-foreground/60">{t("edit.kbdHint")}</p>
      </div>
    );
  }
  const display = vedit.overrides["display"] ?? sel.computed["display"] ?? "";
  const position = vedit.overrides["position"] ?? sel.computed["position"] ?? "";
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5">
        <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">
          {briefLabel(sel)}
        </p>
        <button
          type="button"
          onClick={vedit.undo}
          disabled={!vedit.canUndo}
          title={t("edit.undo")}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
        >
          <Undo2 className="size-3.5" />
        </button>
      </div>
      <div className="space-y-3 p-2">
        {groupsFor(display, position).map((g) => (
          <div key={g.label} className="space-y-0.5">
            <p className="px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
              {g.label}
            </p>
            {g.fields.map((f) => (
              <StyleField key={f.prop} f={f} vedit={vedit} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function EditLayerPanel({ vedit }: { vedit: VisualEdit }) {
  const t = useT();
  const sel = vedit.selected;
  const [dragIdx, setDragIdx] = React.useState<number | null>(null);
  const [overIdx, setOverIdx] = React.useState<number | null>(null);
  if (!sel) {
    return (
      <div className="flex h-full items-center justify-center p-3 text-center text-[11px] text-muted-foreground">
        {t("edit.clickToSelect")}
      </div>
    );
  }
  const childPad = 6 + (sel.ancestors.length + 1) * 10;
  return (
    <div className="flex h-full flex-col overflow-y-auto p-1 text-[11px]">
      {sel.ancestors
        .slice()
        .reverse()
        .map((a, i) => (
          <button
            key={a.selector + i}
            type="button"
            onClick={() => vedit.selectPath(a.selector)}
            style={{ paddingLeft: 6 + i * 10 }}
            className="flex items-center gap-1 truncate rounded py-0.5 pr-1 text-left font-mono text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronUp className="size-3 shrink-0 opacity-50" />
            <span className="truncate">{briefLabel(a)}</span>
          </button>
        ))}
      <div
        style={{ paddingLeft: 6 + sel.ancestors.length * 10 }}
        className="flex items-center gap-1 truncate rounded bg-secondary py-0.5 pr-1 font-mono font-medium text-foreground"
      >
        <span className="truncate">{briefLabel(sel)}</span>
      </div>
      {/* Direct children — click to descend, drag to reorder (live + agent intent). */}
      {sel.children.map((c, i) => (
        <div
          key={c.selector + i}
          draggable
          onDragStart={(e) => {
            setDragIdx(i);
            // WKWebView/Tauri requires effectAllowed (+ some data) for the drag to
            // register a valid drop target — without it onDrop never fires. Matches
            // the codebase's working useDragReorder helper.
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", String(i));
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            if (overIdx !== i) setOverIdx(i);
          }}
          onDragEnd={() => {
            setDragIdx(null);
            setOverIdx(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragIdx !== null && dragIdx !== i) {
              vedit.moveChild(sel.children[dragIdx], c, dragIdx > i);
            }
            setDragIdx(null);
            setOverIdx(null);
          }}
          style={{ paddingLeft: childPad }}
          className={cn(
            "group flex items-center gap-1 truncate rounded py-0.5 pr-1 font-mono text-muted-foreground hover:bg-muted hover:text-foreground",
            overIdx === i && dragIdx !== null && "ring-1 ring-primary/50",
          )}
        >
          <GripVertical className="size-3 shrink-0 cursor-grab opacity-0 group-hover:opacity-50" />
          <button
            type="button"
            onClick={() => vedit.selectPath(c.selector)}
            className="flex min-w-0 flex-1 items-center gap-1 truncate text-left"
          >
            <CornerDownRight className="size-3 shrink-0 opacity-40" />
            <span className="truncate">{briefLabel(c)}</span>
            {c.text && <span className="truncate opacity-50">{c.text.slice(0, 14)}</span>}
          </button>
        </div>
      ))}
    </div>
  );
}

export function PendingEditsBar({
  vedit,
  busy,
  onApply,
  onDiscard,
}: {
  vedit: VisualEdit;
  busy: boolean;
  onApply: () => void;
  onDiscard: () => void;
}) {
  const t = useT();
  if (vedit.editCount === 0) return null;
  return (
    <div className="flex shrink-0 items-center gap-2 border-t bg-muted/40 px-3 py-1.5">
      <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">
          {t("edit.pendingCount", { n: String(vedit.editCount) })}
        </span>{" "}
        · {t("edit.notYetCommitted")}
      </span>
      <button
        type="button"
        onClick={vedit.undo}
        disabled={!vedit.canUndo || busy}
        title={t("edit.undo")}
        className="flex h-7 items-center gap-1 rounded px-1.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
      >
        <Undo2 className="size-3.5" />
      </button>
      <Button size="sm" variant="ghost" className="h-7" disabled={busy} onClick={onDiscard}>
        {t("edit.discard")}
      </Button>
      <Button size="sm" className="h-7 gap-1.5" disabled={busy} onClick={onApply}>
        {busy && <Loader2 className="size-3.5 animate-spin" />}
        {t("edit.applyToCode")}
      </Button>
    </div>
  );
}
