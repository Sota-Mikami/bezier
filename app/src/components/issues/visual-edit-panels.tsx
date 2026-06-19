"use client";

// Visual-edit panels (DEC-131): the Layer panel (left) + Style panel (right) +
// pending-edits bar that wrap the embedded webview while Edit mode is on. Driven by
// useVisualEdit. First cut — a curated style set; structural editing / a full DOM
// tree come later (see playbook/research/2026-06-19_visual-editor-spec.md).

import * as React from "react";
import { MousePointerSquareDashed, ChevronUp, CornerDownRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { ElBrief, StyleDiff, VisualEdit } from "./use-visual-edit";

function briefLabel(b: ElBrief): string {
  const cls = b.classes.length ? "." + b.classes.slice(0, 2).join(".") : "";
  return b.tag + cls;
}

/** rgb()/rgba() or hex → #rrggbb for an <input type=color>; "#000000" on failure. */
function toHex(v: string): string {
  if (!v) return "#000000";
  const s = v.trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s;
  const m = s.match(/rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/i);
  if (!m) return "#000000";
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return "#" + h(+m[1]) + h(+m[2]) + h(+m[3]);
}

interface Field {
  prop: string;
  label: string;
  color?: boolean;
}
const GROUPS: { label: string; fields: Field[] }[] = [
  { label: "Layout", fields: [{ prop: "display", label: "display" }, { prop: "gap", label: "gap" }] },
  {
    label: "Spacing",
    fields: [
      { prop: "padding-top", label: "pad ↑" },
      { prop: "padding-right", label: "pad →" },
      { prop: "padding-bottom", label: "pad ↓" },
      { prop: "padding-left", label: "pad ←" },
      { prop: "margin-top", label: "mar ↑" },
      { prop: "margin-bottom", label: "mar ↓" },
    ],
  },
  { label: "Size", fields: [{ prop: "width", label: "W" }, { prop: "height", label: "H" }] },
  {
    label: "Type",
    fields: [
      { prop: "font-size", label: "size" },
      { prop: "font-weight", label: "weight" },
      { prop: "line-height", label: "leading" },
      { prop: "text-align", label: "align" },
      { prop: "color", label: "color", color: true },
    ],
  },
  {
    label: "Appearance",
    fields: [
      { prop: "background-color", label: "bg", color: true },
      { prop: "border-radius", label: "radius" },
      { prop: "opacity", label: "opacity" },
    ],
  },
];

function StyleField({ f, vedit }: { f: Field; vedit: VisualEdit }) {
  const sel = vedit.selected!;
  const val = vedit.overrides[f.prop] ?? sel.computed[f.prop] ?? "";
  const overridden = f.prop in vedit.overrides;
  return (
    <label className="flex items-center gap-1.5">
      <span
        className={cn(
          "w-16 shrink-0 text-[10px]",
          overridden ? "font-medium text-foreground" : "text-muted-foreground",
        )}
      >
        {overridden ? "● " : ""}
        {f.label}
      </span>
      {f.color && (
        <input
          type="color"
          value={toHex(val)}
          onChange={(e) => vedit.applyStyle(f.prop, e.target.value)}
          className="size-5 shrink-0 cursor-pointer rounded border bg-transparent p-0"
        />
      )}
      <input
        value={val}
        onChange={(e) => vedit.applyStyle(f.prop, e.target.value)}
        spellCheck={false}
        className="h-6 min-w-0 flex-1 rounded-md border bg-transparent px-1.5 font-mono text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
    </label>
  );
}

export function EditStylePanel({ vedit }: { vedit: VisualEdit }) {
  const t = useT();
  if (!vedit.selected) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
        <MousePointerSquareDashed className="size-5 text-muted-foreground" />
        <p className="text-[11px] text-muted-foreground">{t("edit.selectPrompt")}</p>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="shrink-0 border-b px-2 py-1.5">
        <p className="truncate font-mono text-[11px] text-foreground">{briefLabel(vedit.selected)}</p>
      </div>
      <div className="space-y-3 p-2">
        {GROUPS.map((g) => (
          <div key={g.label} className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
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
  return (
    <div className="flex h-full flex-col overflow-y-auto p-1 text-[11px]">
      {!sel ? (
        <div className="flex h-full items-center justify-center px-3 text-center text-muted-foreground">
          {t("edit.clickToSelect")}
        </div>
      ) : (
        <>
          {/* ancestors (nearest last) — click to select up the tree */}
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
          {/* selected */}
          <div
            style={{ paddingLeft: 6 + sel.ancestors.length * 10 }}
            className="flex items-center gap-1 truncate rounded bg-secondary py-0.5 pr-1 font-mono font-medium text-foreground"
          >
            <span className="truncate">{briefLabel(sel)}</span>
          </div>
          {/* children — click to descend */}
          {sel.children.map((c, i) => (
            <button
              key={c.selector + i}
              type="button"
              onClick={() => vedit.selectPath(c.selector)}
              style={{ paddingLeft: 6 + (sel.ancestors.length + 1) * 10 }}
              className="flex items-center gap-1 truncate rounded py-0.5 pr-1 text-left font-mono text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <CornerDownRight className="size-3 shrink-0 opacity-50" />
              <span className="truncate">{briefLabel(c)}</span>
              {c.text && <span className="truncate opacity-50">{c.text.slice(0, 16)}</span>}
            </button>
          ))}
        </>
      )}
    </div>
  );
}

function summarize(diffs: StyleDiff[]): string {
  const first = diffs[0];
  const head = `${first.tag}: ${first.prop} ${first.before}→${first.after}`;
  return diffs.length > 1 ? `${head} (+${diffs.length - 1})` : head;
}

export function PendingEditsBar({
  diffs,
  busy,
  onApply,
  onDiscard,
}: {
  diffs: StyleDiff[];
  busy: boolean;
  onApply: () => void;
  onDiscard: () => void;
}) {
  const t = useT();
  if (diffs.length === 0) return null;
  return (
    <div className="flex shrink-0 items-center gap-2 border-t bg-muted/40 px-3 py-1.5">
      <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">
          {t("edit.pendingCount", { n: String(diffs.length) })}
        </span>{" "}
        · {summarize(diffs)}
      </span>
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
