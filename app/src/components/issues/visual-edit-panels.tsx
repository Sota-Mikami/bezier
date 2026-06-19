"use client";

// Visual-edit panels (DEC-131): Layer panel (left) + Style panel (right) + pending
// bar that wrap the embedded webview while Edit mode is on. Driven by useVisualEdit.
// The inspector mirrors Figma/Framer's UI language (DEC-131 R2): Figma-ordered
// sections (Frame / Position / Layout / Spacing / Fill / Stroke / Effects / Type),
// 2-col paired number fields, icon SegmentedControls for alignment, color swatches,
// and a Figma-style layer tree with per-tag icons. Spec:
// playbook/research/2026-06-19_visual-editor-spec.md (R2 append) + principal-designer.

import * as React from "react";
import {
  MousePointerSquareDashed,
  ChevronUp,
  ChevronDown,
  Loader2,
  Undo2,
  RotateCcw,
  GripVertical,
  ArrowRight,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalSpaceBetween,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  Maximize2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  CircleDashed,
  Layers,
  // tag icons
  Square,
  Type,
  Image as ImageIcon,
  Link as LinkIcon,
  List as ListIcon,
  Navigation2,
  PanelTop,
  PanelBottom,
  TextCursorInput,
  FileText,
  Shapes,
  Box,
  Eye,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { ElBrief, SelectedInfo, VisualEdit } from "./use-visual-edit";

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

const fieldCls =
  "h-6 min-w-0 flex-1 rounded-md border bg-transparent px-1.5 font-mono text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-ring";

function valOf(vedit: VisualEdit, sel: SelectedInfo, prop: string): string {
  return vedit.overrides[prop] ?? sel.computed[prop] ?? "";
}

function NumberField({
  value,
  onCommit,
  className,
}: {
  value: string;
  onCommit: (v: string) => void;
  className?: string;
}) {
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
      className={cn(fieldCls, className)}
    />
  );
}

function ResetBtn({ show, onClick }: { show: boolean; onClick: () => void }) {
  if (!show) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      title="reset"
      className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover/row:opacity-100"
    >
      <RotateCcw className="size-3" />
    </button>
  );
}

/** Label + number field (2-col grid cell). Overridden → ring + hover-reset. */
function PairField({ vedit, sel, label, prop }: { vedit: VisualEdit; sel: SelectedInfo; label: string; prop: string }) {
  const val = valOf(vedit, sel, prop);
  const ov = prop in vedit.overrides;
  return (
    <div className="group/row flex items-center gap-1">
      <span className="w-5 shrink-0 text-center font-mono text-[10px] text-muted-foreground" title={prop}>
        {label}
      </span>
      <NumberField value={val} onCommit={(v) => vedit.applyStyle(prop, v)} className={cn(ov && "ring-1 ring-primary/40")} />
      <ResetBtn show={ov} onClick={() => vedit.resetProp(prop)} />
    </div>
  );
}

function SelectInline({ vedit, sel, prop, options }: { vedit: VisualEdit; sel: SelectedInfo; prop: string; options: string[] }) {
  const val = valOf(vedit, sel, prop);
  const ov = prop in vedit.overrides;
  return (
    <div className="group/row flex items-center gap-1">
      <select
        value={val}
        onChange={(e) => vedit.applyStyle(prop, e.target.value)}
        className={cn(fieldCls, ov && "ring-1 ring-primary/40")}
      >
        {!options.includes(val) && <option value={val}>{val || "—"}</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <ResetBtn show={ov} onClick={() => vedit.resetProp(prop)} />
    </div>
  );
}

type SegOpt = { value: string; icon?: React.ReactNode; label?: string };
function SegRow({
  vedit,
  sel,
  prop,
  label,
  options,
}: {
  vedit: VisualEdit;
  sel: SelectedInfo;
  prop: string;
  label?: string;
  options: SegOpt[];
}) {
  const val = valOf(vedit, sel, prop);
  return (
    <div className="group/row flex items-center gap-2">
      {label && <span className="w-12 shrink-0 text-[10px] text-muted-foreground">{label}</span>}
      <div className="flex flex-1 gap-0.5 rounded-md bg-muted p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={val === o.value}
            title={o.value}
            onClick={() => vedit.applyStyle(prop, o.value)}
            className={cn(
              "flex h-5 flex-1 items-center justify-center rounded text-[10px]",
              val === o.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.icon ?? <span className="font-mono">{o.label}</span>}
          </button>
        ))}
      </div>
      <ResetBtn show={prop in vedit.overrides} onClick={() => vedit.resetProp(prop)} />
    </div>
  );
}

function ColorRow({
  vedit,
  sel,
  prop,
  trailing,
}: {
  vedit: VisualEdit;
  sel: SelectedInfo;
  prop: string;
  trailing?: React.ReactNode;
}) {
  const val = valOf(vedit, sel, prop);
  const ov = prop in vedit.overrides;
  return (
    <div className="group/row flex items-center gap-1.5">
      <label
        className="relative size-5 shrink-0 cursor-pointer overflow-hidden rounded border"
        style={{ background: toHex(val) }}
      >
        <input
          type="color"
          value={toHex(val)}
          onChange={(e) => vedit.applyStyle(prop, e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <input
        value={val}
        onChange={(e) => vedit.applyStyle(prop, e.target.value)}
        spellCheck={false}
        className={cn(fieldCls, ov && "ring-1 ring-primary/40")}
      />
      {trailing}
      <ResetBtn show={ov} onClick={() => vedit.resetProp(prop)} />
    </div>
  );
}

function SecHead({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-0.5 pt-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
      {children}
    </p>
  );
}

const FLEX_DIR: SegOpt[] = [
  { value: "row", icon: <ArrowRight className="size-3" /> },
  { value: "column", icon: <ArrowDown className="size-3" /> },
  { value: "row-reverse", icon: <ArrowLeft className="size-3" /> },
  { value: "column-reverse", icon: <ArrowUp className="size-3" /> },
];
const JUSTIFY: SegOpt[] = [
  { value: "flex-start", icon: <AlignHorizontalJustifyStart className="size-3" /> },
  { value: "center", icon: <AlignHorizontalJustifyCenter className="size-3" /> },
  { value: "flex-end", icon: <AlignHorizontalJustifyEnd className="size-3" /> },
  { value: "space-between", icon: <AlignHorizontalSpaceBetween className="size-3" /> },
];
const ALIGN_ITEMS: SegOpt[] = [
  { value: "flex-start", icon: <AlignVerticalJustifyStart className="size-3" /> },
  { value: "center", icon: <AlignVerticalJustifyCenter className="size-3" /> },
  { value: "flex-end", icon: <AlignVerticalJustifyEnd className="size-3" /> },
  { value: "stretch", icon: <Maximize2 className="size-3" /> },
];
const TEXT_ALIGN: SegOpt[] = [
  { value: "left", icon: <AlignLeft className="size-3" /> },
  { value: "center", icon: <AlignCenter className="size-3" /> },
  { value: "right", icon: <AlignRight className="size-3" /> },
  { value: "justify", icon: <AlignJustify className="size-3" /> },
];
const BORDER_STYLE: SegOpt[] = [
  { value: "none", label: "—" },
  { value: "solid", label: "──" },
  { value: "dashed", label: "- -" },
  { value: "dotted", label: "···" },
];

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
  const display = valOf(vedit, sel, "display");
  const position = valOf(vedit, sel, "position");
  const isFlex = display === "flex" || display === "inline-flex";
  const positioned = position !== "static" && position !== "";
  const P = (label: string, prop: string) => <PairField vedit={vedit} sel={sel} label={label} prop={prop} />;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex h-8 shrink-0 items-center gap-1.5 border-b px-2.5">
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">
          {briefLabel(sel)}
        </span>
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

      <div className="space-y-1 p-2">
        {/* FRAME */}
        <SecHead>{t("edit.secFrame")}</SecHead>
        <div className="grid grid-cols-2 gap-1.5">
          {P("W", "width")}
          {P("H", "height")}
          {P("r", "border-radius")}
          <SelectInline vedit={vedit} sel={sel} prop="overflow" options={["visible", "hidden", "scroll", "auto"]} />
        </div>

        {/* POSITION */}
        <SecHead>{t("edit.secPosition")}</SecHead>
        <div className="grid grid-cols-2 gap-1.5">
          <SelectInline vedit={vedit} sel={sel} prop="position" options={["static", "relative", "absolute", "fixed", "sticky"]} />
          {P("z", "z-index")}
          {positioned && P("T", "top")}
          {positioned && P("R", "right")}
          {positioned && P("B", "bottom")}
          {positioned && P("L", "left")}
        </div>

        {/* LAYOUT */}
        <SecHead>{t("edit.secLayout")}</SecHead>
        <SelectInline vedit={vedit} sel={sel} prop="display" options={["block", "flex", "inline-flex", "grid", "inline-block", "inline", "none"]} />
        {isFlex && (
          <>
            <SegRow vedit={vedit} sel={sel} prop="flex-direction" label={t("edit.lDir")} options={FLEX_DIR} />
            <SegRow vedit={vedit} sel={sel} prop="justify-content" label={t("edit.lJustify")} options={JUSTIFY} />
            <SegRow vedit={vedit} sel={sel} prop="align-items" label={t("edit.lAlign")} options={ALIGN_ITEMS} />
            <div className="grid grid-cols-2 gap-1.5">
              {P("gap", "gap")}
              {P("grow", "flex-grow")}
            </div>
            <SelectInline vedit={vedit} sel={sel} prop="align-self" options={["auto", "stretch", "flex-start", "center", "flex-end"]} />
          </>
        )}

        {/* SPACING */}
        <SecHead>{t("edit.secSpacing")}</SecHead>
        <p className="px-0.5 text-[10px] text-muted-foreground/60">{t("edit.padding")}</p>
        <div className="grid grid-cols-2 gap-1.5">
          {P("↑", "padding-top")}
          {P("↓", "padding-bottom")}
          {P("←", "padding-left")}
          {P("→", "padding-right")}
        </div>
        <p className="px-0.5 text-[10px] text-muted-foreground/60">{t("edit.margin")}</p>
        <div className="grid grid-cols-2 gap-1.5">
          {P("↑", "margin-top")}
          {P("↓", "margin-bottom")}
          {P("←", "margin-left")}
          {P("→", "margin-right")}
        </div>

        {/* FILL */}
        <SecHead>{t("edit.secFill")}</SecHead>
        <ColorRow vedit={vedit} sel={sel} prop="background-color" />

        {/* STROKE */}
        <SecHead>{t("edit.secStroke")}</SecHead>
        <ColorRow
          vedit={vedit}
          sel={sel}
          prop="border-color"
          trailing={
            <input
              value={valOf(vedit, sel, "border-width")}
              onChange={(e) => vedit.applyStyle("border-width", e.target.value)}
              spellCheck={false}
              title="border-width"
              className="h-6 w-12 rounded-md border bg-transparent px-1.5 text-right font-mono text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          }
        />
        <SegRow vedit={vedit} sel={sel} prop="border-style" options={BORDER_STYLE} />

        {/* EFFECTS */}
        <SecHead>{t("edit.secEffects")}</SecHead>
        <div className="group/row flex items-center gap-1.5">
          <CircleDashed className="size-3.5 shrink-0 text-muted-foreground" />
          <NumberField
            value={valOf(vedit, sel, "opacity")}
            onCommit={(v) => vedit.applyStyle("opacity", v)}
            className={cn("opacity" in vedit.overrides && "ring-1 ring-primary/40")}
          />
          <ResetBtn show={"opacity" in vedit.overrides} onClick={() => vedit.resetProp("opacity")} />
        </div>
        <div className="group/row flex items-center gap-1.5">
          <Layers className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            value={valOf(vedit, sel, "box-shadow")}
            onChange={(e) => vedit.applyStyle("box-shadow", e.target.value)}
            spellCheck={false}
            placeholder="none"
            className={cn(fieldCls, "box-shadow" in vedit.overrides && "ring-1 ring-primary/40")}
          />
          <ResetBtn show={"box-shadow" in vedit.overrides} onClick={() => vedit.resetProp("box-shadow")} />
        </div>

        {/* TYPOGRAPHY */}
        <SecHead>{t("edit.secType")}</SecHead>
        <div className="grid grid-cols-2 gap-1.5">
          {P("fs", "font-size")}
          {P("fw", "font-weight")}
          {P("lh", "line-height")}
          {P("ls", "letter-spacing")}
        </div>
        <SegRow vedit={vedit} sel={sel} prop="text-align" options={TEXT_ALIGN} />
        <ColorRow vedit={vedit} sel={sel} prop="color" />
      </div>
    </div>
  );
}

// --- Layer panel (Figma-style tree) -----------------------------------------

const TAG_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  div: Square,
  section: Square,
  article: Square,
  main: Square,
  aside: Square,
  header: PanelTop,
  footer: PanelBottom,
  nav: Navigation2,
  form: FileText,
  p: Type,
  h1: Type,
  h2: Type,
  h3: Type,
  h4: Type,
  h5: Type,
  h6: Type,
  span: Type,
  li: Type,
  a: LinkIcon,
  button: Square,
  input: TextCursorInput,
  textarea: TextCursorInput,
  img: ImageIcon,
  svg: Shapes,
  ul: ListIcon,
  ol: ListIcon,
};
function TagIcon({ tag, className }: { tag: string; className?: string }) {
  const Icon = TAG_ICON[tag.toLowerCase()] ?? Box;
  return <Icon className={className} />;
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
  const selPad = 4 + sel.ancestors.length * 12;
  const childPad = 4 + (sel.ancestors.length + 1) * 12;
  return (
    <div className="flex h-full flex-col overflow-y-auto py-1 text-[11px]">
      {sel.ancestors
        .slice()
        .reverse()
        .map((a, i) => (
          <button
            key={a.selector + i}
            type="button"
            onClick={() => vedit.selectPath(a.selector)}
            style={{ paddingLeft: 4 + i * 12 }}
            className="flex h-[22px] items-center gap-1 truncate rounded pr-1.5 text-left font-mono text-muted-foreground/70 hover:bg-muted hover:text-foreground"
          >
            <ChevronUp className="size-3 shrink-0 opacity-40" />
            <TagIcon tag={a.tag} className="size-3 shrink-0 opacity-60" />
            <span className="truncate">{briefLabel(a)}</span>
          </button>
        ))}
      <div
        style={{ paddingLeft: selPad }}
        className="flex h-[22px] items-center gap-1 truncate rounded bg-accent pr-1.5 font-mono font-medium text-foreground"
      >
        {sel.children.length > 0 ? (
          <ChevronDown className="size-3 shrink-0" />
        ) : (
          <span className="size-3 shrink-0" />
        )}
        <TagIcon tag={sel.tag} className="size-3 shrink-0 opacity-70" />
        <span className="truncate">{briefLabel(sel)}</span>
      </div>
      {sel.children.map((c, i) => (
        <div
          key={c.selector + i}
          draggable
          onDragStart={(e) => {
            setDragIdx(i);
            // WKWebView/Tauri requires effectAllowed (+ data) for the drag to register
            // a valid drop target — without it onDrop never fires. (DEC-131 fix.)
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
            "group flex h-[22px] items-center gap-1 truncate rounded pr-1.5 font-mono text-muted-foreground hover:bg-muted hover:text-foreground",
            overIdx === i && dragIdx !== null && "ring-1 ring-primary/50",
          )}
        >
          <GripVertical className="size-3 shrink-0 cursor-grab opacity-0 group-hover:opacity-40" />
          <button
            type="button"
            onClick={() => vedit.selectPath(c.selector)}
            className="flex min-w-0 flex-1 items-center gap-1 truncate text-left"
          >
            <TagIcon tag={c.tag} className="size-3 shrink-0 opacity-50" />
            <span className="truncate">{briefLabel(c)}</span>
            {c.text && <span className="truncate text-[10px] opacity-40">{c.text.slice(0, 12)}</span>}
          </button>
          <Eye className="size-3 shrink-0 opacity-0" />
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
