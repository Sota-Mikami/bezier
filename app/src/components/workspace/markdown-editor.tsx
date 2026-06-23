"use client";

// CodeMirror 6 markdown editor with Obsidian-style "Live Preview" (DEC-010).
//
// Replaces PlateEditor for .md/.mdx docs. The source of truth is the markdown
// TEXT — editing edits doc.body directly, so there is no node tree and no
// markdown round-trip. The live-preview decorations (formatted by default, raw
// syntax revealed on the active line) live in markdown-live-preview.ts.
//
// Client-only (CodeMirror touches the DOM). The integration loads this via
// next/dynamic(() => import("..."), { ssr:false }).
//
// It exposes the SAME handle + props contract as PlateEditor so the parent
// barely changes, and keeps the identical save semantics: a clean (un-edited)
// document writes the ORIGINAL bytes back verbatim for a zero diff.

import * as React from "react";
import {
  EditorView,
  keymap,
  placeholder as cmPlaceholder,
  highlightSpecialChars,
  drawSelection,
  Decoration,
  type DecorationSet,
} from "@codemirror/view";
import {
  EditorState,
  StateField,
  StateEffect,
  type Range,
} from "@codemirror/state";
import { history, defaultKeymap, historyKeymap } from "@codemirror/commands";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import {
  autocompletion,
  completionKeymap,
  completionStatus,
  acceptCompletion,
} from "@codemirror/autocomplete";
import {
  markdown,
  markdownLanguage,
  insertNewlineContinueMarkup,
  deleteMarkupBackward,
} from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { stringify as yamlStringify } from "yaml";

import type { OpenDoc } from "@/lib/ipc";
import { writeFile } from "@/lib/ipc";
import type { Frontmatter } from "@/lib/frontmatter";
import { livePreview } from "@/components/workspace/markdown-live-preview";
import {
  makeSlashCommands,
  slashAddToOptions,
} from "@/components/workspace/markdown-slash-commands";
import {
  insertImageFiles,
  dirOf,
  dragHasFiles,
} from "@/components/workspace/markdown-images";
import { MessageSquarePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { tt } from "@/lib/i18n";

export interface MarkdownEditorHandle {
  /** Persist the document to disk. Zero-diff when nothing was edited. */
  save: () => Promise<void>;
  /** Whether the editor body has unsaved edits. */
  isDirty: () => boolean;
  /** Current editor body text (markdown, sans frontmatter). */
  getText: () => string;
  /**
   * Drop the dirty flag WITHOUT saving — the in-editor text is unchanged but is
   * no longer considered unsaved. Used when intentionally discarding local edits
   * (e.g. adopting an external rewrite): a subsequent flushOnUnmount becomes a
   * no-op so the about-to-be-discarded edits aren't written back.
   */
  clearDirty: () => void;
  /** Scroll the editor to a 1-based body line (the Spec ToC, DEC-057). */
  scrollToLine: (line: number) => void;
}

export interface MarkdownEditorProps {
  doc: OpenDoc;
  /** Fired whenever the editor's body dirty state changes. */
  onDirtyChange?: (dirty: boolean) => void;
  /**
   * Fired on EVERY document change (not just dirty transitions). Lets a parent
   * implement debounced autosave by resetting a timer on each edit.
   */
  onEdit?: () => void;
  /**
   * Current frontmatter values. When `frontmatterDirty` is true these are
   * re-emitted on save; otherwise the original raw block is preserved verbatim.
   */
  frontmatter?: Frontmatter;
  /** Whether frontmatter fields were edited (controls re-emit vs verbatim). */
  frontmatterDirty?: boolean;
  /** Fired after a successful save. */
  onSaved?: () => void;
  /**
   * When true, best-effort flush a save() on unmount if the body is dirty.
   * Opt-in (default off) so callers relying on remount-to-rebaseline (e.g.
   * /workspace) are unaffected. Used by the autosaving Spec slot editor so the
   * last edits aren't lost when leaving the issue before the debounce fires.
   */
  flushOnUnmount?: boolean;
  /**
   * 1-based line numbers (into the editor body) to briefly FLASH on mount — the
   * "live change visualization" (DEC-012 §7). When the agent rewrites spec.md
   * externally, the SlotEditor computes a line diff and remounts this editor with
   * the changed lines here; on mount they get a `cm-flash` line decoration that
   * fades out (~2.5s) so the user sees exactly what changed. Empty/undefined = no
   * flash. Applied once per mount (this component remounts on each external reload).
   */
  flashLines?: number[];
  /** Fired (rAF-throttled) with the 1-based line at the top of the viewport, so a
   * ToC can highlight the section in view (DEC-057). */
  onScrollLine?: (line: number) => void;
  /** Fired when the maker selects text in the doc and adds a comment — routes to the
   *  AI as a revision instruction anchored to the SELECTED TEXT (a semantic span, not
   *  a coordinate pin). When set, a floating "Comment" button appears on selection. */
  onComment?: (selectedText: string, comment: string) => void;
  className?: string;
}

/**
 * Re-emit a frontmatter block from structured fields. Only used when the user
 * edited frontmatter; otherwise the original raw block is preserved byte-for-byte.
 */
function emitFrontmatter(fm: Frontmatter | undefined): string {
  const data: Record<string, unknown> = {};
  if (fm) {
    if (fm.title) data.title = fm.title;
    if (fm.type) data.type = fm.type;
    if (fm.status) data.status = fm.status;
    if (fm.created) data.created = fm.created;
    if (fm.links && fm.links.length > 0) data.links = fm.links;
  }
  if (Object.keys(data).length === 0) return "";
  // yamlStringify ends with a trailing newline -> `---\n<yaml>---\n`.
  return `---\n${yamlStringify(data)}---\n`;
}

// --- List / block indentation (DEC-044): Tab / Shift-Tab ------------------
// Tab indents the current line(s) by one unit (two spaces), Shift-Tab outdents.
// Works for any line but is tuned for markdown lists (bullet / numbered / task),
// letting you nest items the usual way. Capped at MAX_INDENT_LEVELS so a stray
// Tab can't run away. When the slash-command popup is open, Tab accepts it.

const INDENT_UNIT = "  "; // two spaces per nesting level
const MAX_INDENT_LEVELS = 4;
const LIST_RE = /^(\s*)(?:[-*+]|\d+[.)])(?:\s+\[[ xX]\])?(?:\s|$)/;

/** Line numbers touched by any selection range. */
function affectedLineNumbers(state: EditorState): number[] {
  const nums = new Set<number>();
  for (const r of state.selection.ranges) {
    const a = state.doc.lineAt(r.from).number;
    const b = state.doc.lineAt(r.to).number;
    for (let n = a; n <= b; n++) nums.add(n);
  }
  return [...nums];
}

/** Visual width of a line's leading whitespace (tab counts as two). */
function leadWidth(text: string): number {
  const lead = /^[ \t]*/.exec(text)?.[0] ?? "";
  let w = 0;
  for (const ch of lead) w += ch === "\t" ? 2 : 1;
  return w;
}

function indentCommand(view: EditorView): boolean {
  // Tab accepts an open slash-command completion (Notion-style).
  if (completionStatus(view.state) === "active") return acceptCompletion(view);

  const { state } = view;
  const sel = state.selection.main;
  // A single caret on a NON-list line → just insert an indent unit (plain tab),
  // so Tab is still useful in prose.
  if (state.selection.ranges.length === 1 && sel.empty) {
    const line = state.doc.lineAt(sel.head);
    if (!LIST_RE.test(line.text)) {
      view.dispatch(
        state.update({
          changes: { from: sel.head, insert: INDENT_UNIT },
          selection: { anchor: sel.head + INDENT_UNIT.length },
          userEvent: "input.indent",
        }),
      );
      return true;
    }
  }
  // Otherwise indent each affected line at its start (capped). Empty lines and
  // lines already at the depth cap are skipped.
  const changes: { from: number; insert: string }[] = [];
  for (const n of affectedLineNumbers(state)) {
    const line = state.doc.line(n);
    if (line.length === 0) continue;
    if (leadWidth(line.text) >= MAX_INDENT_LEVELS * INDENT_UNIT.length) continue;
    changes.push({ from: line.from, insert: INDENT_UNIT });
  }
  if (changes.length > 0) {
    view.dispatch(state.update({ changes, userEvent: "input.indent" }));
  }
  return true; // swallow Tab either way (never blur the editor)
}

function dedentCommand(view: EditorView): boolean {
  if (completionStatus(view.state) === "active") return acceptCompletion(view);

  const { state } = view;
  const changes: { from: number; to: number; insert: string }[] = [];
  for (const n of affectedLineNumbers(state)) {
    const line = state.doc.line(n);
    const m = /^([ \t]+)/.exec(line.text);
    if (!m) continue;
    // Remove one unit: a leading tab, or up to two leading spaces.
    const remove = line.text[0] === "\t" ? 1 : Math.min(INDENT_UNIT.length, m[1].length);
    if (remove > 0) {
      changes.push({ from: line.from, to: line.from + remove, insert: "" });
    }
  }
  if (changes.length > 0) {
    view.dispatch(state.update({ changes, userEvent: "delete.dedent" }));
  }
  return true;
}

/**
 * Custom syntax highlight style for fenced code blocks. Deliberately does NOT
 * style heading / emphasis / link tags — those are owned by the live-preview
 * line/mark decorations, and CM's stock `defaultHighlightStyle` underlines
 * headings (the bug this replaces). Colors come from CSS vars set in
 * `editorTheme` so they adapt to light/dark; the palette is restrained.
 */
const codeHighlightStyle = HighlightStyle.define([
  {
    tag: [
      t.keyword,
      t.modifier,
      t.controlKeyword,
      t.operatorKeyword,
      t.definitionKeyword,
      t.moduleKeyword,
    ],
    color: "var(--cm-keyword)",
  },
  {
    tag: [t.string, t.special(t.string), t.regexp, t.character],
    color: "var(--cm-string)",
  },
  { tag: [t.number, t.bool, t.atom, t.null], color: "var(--cm-number)" },
  {
    tag: [t.comment, t.lineComment, t.blockComment, t.docComment, t.meta],
    color: "var(--cm-comment)",
    fontStyle: "italic",
  },
  {
    tag: [t.function(t.variableName), t.function(t.propertyName), t.labelName],
    color: "var(--cm-function)",
  },
  {
    tag: [t.typeName, t.className, t.namespace, t.escape],
    color: "var(--cm-type)",
  },
  { tag: [t.tagName, t.angleBracket], color: "var(--cm-tag)" },
  { tag: [t.attributeName, t.propertyName], color: "var(--cm-attr)" },
  {
    tag: [t.operator, t.punctuation, t.separator, t.derefOperator],
    color: "var(--cm-punct)",
  },
  { tag: [t.variableName], color: "var(--cm-name)" },
  { tag: [t.invalid], color: "var(--destructive)" },
]);

/** Editor chrome + live-preview styling, themed to the app's shadcn tokens. */
const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "15px",
    color: "var(--foreground)",
    backgroundColor: "transparent",
    // Code-block token palette (light). Restrained, GitHub-ish.
    "--cm-keyword": "#8a3fa0",
    "--cm-string": "#1a7f37",
    "--cm-number": "#0550ae",
    "--cm-comment": "#6e7781",
    "--cm-function": "#6639ba",
    "--cm-type": "#953800",
    "--cm-tag": "#116329",
    "--cm-attr": "#0550ae",
    "--cm-punct": "var(--muted-foreground)",
    "--cm-name": "var(--foreground)",
  },
  ".dark &": {
    // Code-block token palette (dark). Brighter for the dark surface.
    "--cm-keyword": "#d2a8ff",
    "--cm-string": "#7ee787",
    "--cm-number": "#79c0ff",
    "--cm-comment": "#8b949e",
    "--cm-function": "#d2a8ff",
    "--cm-type": "#ffa657",
    "--cm-tag": "#7ee787",
    "--cm-attr": "#79c0ff",
    "--cm-punct": "var(--muted-foreground)",
    "--cm-name": "var(--foreground)",
  },
  "&.cm-editor.cm-focused": { outline: "none" },
  // Image drag-drop target highlight (DEC-044): a dashed ring + faint tint while
  // an image is dragged over the editor, so the drop has an obvious target.
  "&.cm-drag-over": {
    outline: "2px dashed var(--primary)",
    outlineOffset: "-8px",
    borderRadius: "10px",
    backgroundColor: "color-mix(in oklab, var(--primary) 5%, transparent)",
  },
  ".cm-scroller": {
    fontFamily:
      "var(--font-sans, ui-sans-serif, system-ui, -apple-system, sans-serif)",
    lineHeight: "1.7",
    overflow: "auto",
  },
  ".cm-content": {
    padding: "28px 32px 40vh",
    maxWidth: "44rem",
    margin: "0 auto",
    width: "100%",
    caretColor: "var(--foreground)",
  },
  ".cm-line": { padding: "0 2px" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--foreground)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "color-mix(in oklab, var(--primary) 14%, transparent)",
  },
  ".cm-placeholder": { color: "var(--muted-foreground)" },

  // AI change highlight (DEC-037 / DEC-057): when the agent rewrites the Spec, the
  // changed lines get (1) a single light "shimmer" sweep across them — an
  // AI-generation feel — and (2) a soft violet tint that settles and fades. The
  // left gutter bar was removed (CEO: ハイライトだけで OK). One-shot + self-clearing
  // so it's noticeable but never しつこい. Background-only, so it never affects CM6's
  // line-height measurement.
  ".cm-ai-change": {
    position: "relative",
    borderRadius: "3px",
    animation: "cm-ai-settle 3.2s cubic-bezier(0.22, 1, 0.36, 1) forwards",
  },
  "@keyframes cm-ai-settle": {
    "0%": {
      backgroundColor: "color-mix(in oklab, var(--ai) 15%, transparent)",
    },
    "60%": {
      backgroundColor: "color-mix(in oklab, var(--ai) 9%, transparent)",
    },
    "100%": {
      backgroundColor: "transparent",
    },
  },
  // The shimmer sweep: a soft light band crossing the line once, left→right.
  ".cm-ai-change::after": {
    content: "''",
    position: "absolute",
    inset: "0",
    borderRadius: "3px",
    pointerEvents: "none",
    background:
      "linear-gradient(100deg, transparent 18%, color-mix(in oklab, var(--ai) 26%, transparent) 50%, transparent 82%)",
    backgroundSize: "220% 100%",
    backgroundRepeat: "no-repeat",
    animation: "cm-ai-sweep 1.1s ease-out forwards",
  },
  "@keyframes cm-ai-sweep": {
    "0%": { backgroundPosition: "-30% 0", opacity: "0" },
    "25%": { opacity: "1" },
    "100%": { backgroundPosition: "150% 0", opacity: "0" },
  },

  // Revealed (on-cursor) syntax punctuation: shown, muted (Obsidian-style).
  ".cm-md-syntax": { color: "var(--muted-foreground)", opacity: "0.5" },

  // Headings — clean scale + vertical rhythm, NO underline, NO border.
  // NOTE: spacing uses padding, NOT margin. CM6 measures line height from
  // padding but NOT vertical margin, so margins on a .cm-line decoration drift
  // the caret/selection geometry. Padding keeps the rhythm AND the coords sane.
  ".cm-md-h1": {
    fontSize: "1.7em",
    fontWeight: "700",
    lineHeight: "1.25",
    paddingTop: "1.4em",
    paddingBottom: "0.3em",
    letterSpacing: "-0.01em",
  },
  ".cm-md-h2": {
    fontSize: "1.4em",
    fontWeight: "650",
    lineHeight: "1.3",
    paddingTop: "1.2em",
    paddingBottom: "0.25em",
    letterSpacing: "-0.01em",
  },
  ".cm-md-h3": {
    fontSize: "1.18em",
    fontWeight: "600",
    lineHeight: "1.35",
    paddingTop: "1em",
    paddingBottom: "0.2em",
  },
  ".cm-md-h4": {
    fontSize: "1.05em",
    fontWeight: "600",
    paddingTop: "0.9em",
    paddingBottom: "0.15em",
  },
  ".cm-md-h5": { fontSize: "0.95em", fontWeight: "600", paddingTop: "0.8em" },
  ".cm-md-h6": {
    fontSize: "0.88em",
    fontWeight: "600",
    paddingTop: "0.8em",
    color: "var(--muted-foreground)",
  },

  // Inline marks.
  ".cm-md-strong": { fontWeight: "700" },
  ".cm-md-em": { fontStyle: "italic" },
  ".cm-md-strike": { textDecoration: "line-through", color: "var(--muted-foreground)" },
  ".cm-md-inline-code": {
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
    fontSize: "0.86em",
    backgroundColor: "var(--muted)",
    padding: "0.1em 0.35em",
    borderRadius: "5px",
  },
  // Links — calm (Notion/Linear): colored, no always-on underline; hover only.
  ".cm-md-link": {
    color: "var(--primary)",
    fontWeight: "500",
    textDecoration: "none",
    cursor: "pointer",
  },
  ".cm-md-link:hover": { textDecoration: "underline", textUnderlineOffset: "2px" },

  // Blockquote (line decoration with a left bar).
  ".cm-md-blockquote": {
    borderLeft: "3px solid var(--border)",
    paddingLeft: "0.9em",
    color: "var(--muted-foreground)",
  },

  // Lists.
  ".cm-md-bullet": { color: "var(--muted-foreground)" },
  // GFM task-list checkbox (DEC-042 / DEC-044): a custom span styled as a
  // larger, tappable rounded box with a CSS checkmark (the raw `-` bullet is
  // hidden for task items). Sized in em so it tracks the body font.
  ".cm-md-checkbox": {
    // inline-block + a FIXED em box, with the checkmark absolutely positioned
    // (out of flow) so the box height is identical whether checked or not — no
    // line-height jump on toggle.
    position: "relative",
    display: "inline-block",
    boxSizing: "border-box",
    width: "1.2em",
    height: "1.2em",
    lineHeight: "1.2em",
    margin: "0 0.5em 0 0",
    verticalAlign: "-0.25em",
    border: "1.5px solid var(--muted-foreground)",
    borderRadius: "5px",
    backgroundColor: "var(--background)",
    cursor: "pointer",
    transition: "background-color 0.12s ease, border-color 0.12s ease",
  },
  ".cm-md-checkbox:hover": {
    borderColor: "var(--primary)",
    backgroundColor: "color-mix(in oklab, var(--primary) 10%, var(--background))",
  },
  ".cm-md-checkbox-checked": {
    borderColor: "var(--primary)",
    backgroundColor: "var(--primary)",
  },
  ".cm-md-checkbox-checked:hover": {
    backgroundColor: "var(--primary)",
  },
  // The checkmark — a rotated border-corner, absolutely centered so it never
  // affects the box's layout/height.
  ".cm-md-checkbox-checked::after": {
    content: "''",
    position: "absolute",
    left: "50%",
    top: "46%",
    width: "0.3em",
    height: "0.56em",
    border: "solid var(--primary-foreground)",
    borderWidth: "0 2px 2px 0",
    transform: "translate(-50%, -55%) rotate(45deg)",
  },

  // Inline images (DEC-043 #1) — rendered from `![](assets/…)` off-cursor.
  ".cm-md-image": { display: "inline-block", maxWidth: "100%" },
  ".cm-md-image img": {
    maxWidth: "100%",
    height: "auto",
    borderRadius: "8px",
    border: "1px solid var(--border)",
    display: "block",
  },
  ".cm-md-image-missing": {
    color: "var(--muted-foreground)",
    fontSize: "0.86em",
    fontStyle: "italic",
  },
  ".cm-md-image-missing img": { display: "none" },

  // Fenced code (line band) + dimmed fences.
  ".cm-md-codeblock": {
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
    fontSize: "0.86em",
    backgroundColor: "var(--muted)",
  },
  ".cm-md-fence": { color: "var(--muted-foreground)" },

  // GFM table widget. Spacing lives on the wrapper's PADDING (measured by CM6),
  // not the table's margin (which would escape height measurement).
  ".cm-md-tableblock": { padding: "0.45em 0" },
  ".cm-md-table": {
    borderCollapse: "collapse",
    margin: "0",
    fontSize: "0.92em",
    width: "auto",
  },
  ".cm-md-table th, .cm-md-table td": {
    border: "1px solid var(--border)",
    padding: "0.4em 0.7em",
    textAlign: "left",
    verticalAlign: "top",
  },
  ".cm-md-table th": { fontWeight: "600", backgroundColor: "var(--muted)" },

  // Horizontal-rule widget.
  ".cm-md-hr": { padding: "0.6em 0" },
  ".cm-md-hr hr": {
    border: "none",
    borderTop: "1px solid var(--border)",
    margin: "0",
  },

  // --- Slash-command autocomplete popup (Notion-style rows) ---------------
  ".cm-tooltip.cm-tooltip-autocomplete": {
    minWidth: "344px",
    border: "1px solid var(--border)",
    borderRadius: "14px",
    backgroundColor: "var(--popover)",
    color: "var(--popover-foreground)",
    boxShadow: "0 16px 40px -16px rgba(0,0,0,0.32)",
    overflow: "hidden",
    padding: "7px",
  },
  ".cm-tooltip-autocomplete > ul": {
    fontFamily:
      "var(--font-sans, ui-sans-serif, system-ui, -apple-system, sans-serif)",
    maxHeight: "22em",
    margin: "0",
  },
  // Row = icon tile (spanning both rows) | title / description grid.
  ".cm-tooltip-autocomplete > ul > li": {
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    gridTemplateRows: "auto auto",
    columnGap: "12px",
    rowGap: "3px",
    alignItems: "center",
    padding: "9px 11px",
    margin: "1px 0",
    borderRadius: "10px",
    lineHeight: "1.35",
    color: "var(--popover-foreground)",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--accent)",
    color: "var(--accent-foreground)",
  },
  // Left icon tile.
  ".cm-slash-icon": {
    gridColumn: "1",
    gridRow: "1 / span 2",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "34px",
    height: "34px",
    borderRadius: "9px",
    border: "1px solid var(--border)",
    backgroundColor: "var(--muted)",
    color: "var(--foreground)",
  },
  ".cm-slash-icon svg": { width: "17px", height: "17px", display: "block" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected] .cm-slash-icon": {
    backgroundColor: "var(--background)",
  },
  // Title (CM's default label — keeps match highlighting).
  ".cm-tooltip-autocomplete .cm-completionLabel": {
    gridColumn: "2",
    gridRow: "1",
    fontSize: "13.5px",
    fontWeight: "550",
    letterSpacing: "-0.005em",
    whiteSpace: "nowrap",
  },
  // Description (second line).
  ".cm-slash-desc": {
    gridColumn: "2",
    gridRow: "2",
    fontSize: "12px",
    lineHeight: "1.35",
    color: "var(--muted-foreground)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected] .cm-slash-desc": {
    color: "color-mix(in oklab, var(--accent-foreground) 70%, transparent)",
  },
  ".cm-completionMatchedText": {
    textDecoration: "none",
    fontWeight: "700",
    color: "inherit",
  },
});

// --- Live change flash (DEC-012 §7) --------------------------------------
// A self-contained decoration layer (separate from livePreview) that paints a
// `cm-flash` line decoration on a set of lines, driven by a StateEffect. The CSS
// (`@keyframes cm-flash-fade` in editorTheme) fades the accent background out
// over ~2.5s; the SlotEditor then dispatches an empty set to drop the (now
// invisible) decoration. Line decorations must come from a StateField, so this
// is one.
const setFlashLines = StateEffect.define<readonly number[]>();
const flashLineDeco = Decoration.line({ class: "cm-ai-change" });

const flashField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(value, tr) {
    value = value.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setFlashLines)) continue;
      const lines = e.value;
      if (lines.length === 0) {
        value = Decoration.none;
        continue;
      }
      const doc = tr.state.doc;
      const ranges: Range<Decoration>[] = [];
      // `lines` arrives ascending (the diff walks the new content top-down), so
      // the line.from positions are already sorted for the RangeSet.
      for (const ln of lines) {
        if (ln < 1 || ln > doc.lines) continue;
        ranges.push(flashLineDeco.range(doc.line(ln).from));
      }
      value = Decoration.set(ranges, true);
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

function MarkdownEditorInner(
  props: MarkdownEditorProps,
  ref: React.ForwardedRef<MarkdownEditorHandle>,
) {
  const {
    doc,
    onDirtyChange,
    onEdit,
    frontmatter,
    frontmatterDirty,
    onSaved,
    flushOnUnmount,
    flashLines,
    onScrollLine,
    onComment,
    className,
  } = props;

  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const viewRef = React.useRef<EditorView | null>(null);
  // Timer that clears the flash decoration after the fade animation completes.
  const flashTimerRef = React.useRef<number | null>(null);

  // Latest props/doc kept in refs so save() reads fresh values and the editor
  // does NOT rebuild when only the frontmatter draft changes (which would lose
  // the caret + edits). The parent remounts this whole component (via key) on
  // document switch / post-save reload, so the editor itself mounts once. The
  // refs are synced in a commit-phase effect (writing refs during render is
  // disallowed under React 19).
  const docRef = React.useRef(doc);
  const fmRef = React.useRef(frontmatter);
  const fmDirtyRef = React.useRef(frontmatterDirty);
  const onSavedRef = React.useRef(onSaved);
  const onDirtyRef = React.useRef(onDirtyChange);
  const onEditRef = React.useRef(onEdit);
  const onScrollLineRef = React.useRef(onScrollLine);
  const onCommentRef = React.useRef(onComment);
  const flushOnUnmountRef = React.useRef(flushOnUnmount);
  const saveRef = React.useRef<() => Promise<void>>(async () => {});
  React.useEffect(() => {
    docRef.current = doc;
    fmRef.current = frontmatter;
    fmDirtyRef.current = frontmatterDirty;
    onSavedRef.current = onSaved;
    onDirtyRef.current = onDirtyChange;
    onEditRef.current = onEdit;
    onScrollLineRef.current = onScrollLine;
    onCommentRef.current = onComment;
    flushOnUnmountRef.current = flushOnUnmount;
  });

  // Text-selection comment (DEC: semantic md comment, not an XY pin). On a non-empty
  // selection we surface a floating "Comment" button at the selection; submitting
  // routes {selected text, comment} to the AI via onComment.
  const [selComment, setSelComment] = React.useState<{
    text: string;
    top: number;
    left: number;
  } | null>(null);
  const [commentOpen, setCommentOpen] = React.useState(false);
  const [commentDraft, setCommentDraft] = React.useState("");

  const dirtyRef = React.useRef(false);
  const markDirty = React.useCallback((next: boolean) => {
    if (dirtyRef.current === next) return;
    dirtyRef.current = next;
    onDirtyRef.current?.(next);
  }, []);

  // Mount once. doc.body is the clean baseline; "dirty" = current text differs.
  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const updateListener = EditorView.updateListener.of((u) => {
      if (!u.docChanged) return;
      markDirty(u.state.doc.toString() !== docRef.current.body);
      onEditRef.current?.();
    });

    // Surface a floating "Comment" button while text is selected (only when a parent
    // wired onComment). Tracks the selection start through scroll/geometry changes.
    const selectionListener = EditorView.updateListener.of((u) => {
      if (!onCommentRef.current) return;
      if (!u.selectionSet && !u.docChanged && !u.geometryChanged && !u.viewportChanged) return;
      const r = u.state.selection.main;
      if (r.empty) {
        setSelComment(null);
        setCommentOpen(false);
        return;
      }
      const text = u.state.sliceDoc(r.from, r.to).trim();
      const coords = u.view.coordsAtPos(r.from);
      if (!text || !coords) {
        setSelComment(null);
        return;
      }
      setSelComment({ text, top: coords.top, left: coords.left });
    });

    // Doc directory: resolves relative image paths for inline render + is where
    // pasted/dropped images are saved (DEC-043 #1). Fixed for this mounted doc.
    const baseDir = dirOf(docRef.current.path);

    // Paste / drag-drop image insertion (markdown-images.ts), plus a drop-zone
    // highlight so a drag has a clear target. dragover MUST preventDefault for
    // the drop to fire (otherwise WebView swallows / navigates to the file).
    const imageHandlers = EditorView.domEventHandlers({
      paste(event, ev) {
        const items = event.clipboardData?.items;
        if (!items) return false;
        const files: File[] = [];
        for (const it of Array.from(items)) {
          if (it.kind === "file" && it.type.startsWith("image/")) {
            const f = it.getAsFile();
            if (f) files.push(f);
          }
        }
        if (files.length === 0) return false;
        event.preventDefault();
        void insertImageFiles(ev, baseDir, files);
        return true;
      },
      dragenter(event, ev) {
        if (!dragHasFiles(event)) return false;
        event.preventDefault();
        ev.dom.classList.add("cm-drag-over");
        return false;
      },
      dragover(event, ev) {
        if (!dragHasFiles(event)) return false;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
        ev.dom.classList.add("cm-drag-over");
        return false;
      },
      dragleave(event, ev) {
        // Only clear when the pointer actually leaves the editor (not when it
        // crosses between child elements).
        const to = event.relatedTarget as Node | null;
        if (!to || !ev.dom.contains(to)) ev.dom.classList.remove("cm-drag-over");
        return false;
      },
      drop(event, ev) {
        ev.dom.classList.remove("cm-drag-over");
        const dt = event.dataTransfer;
        if (!dt || dt.files.length === 0) return false;
        const files = Array.from(dt.files).filter((f) =>
          f.type.startsWith("image/"),
        );
        if (files.length === 0) return false;
        event.preventDefault();
        const pos = ev.posAtCoords({ x: event.clientX, y: event.clientY });
        void insertImageFiles(ev, baseDir, files, pos ?? undefined);
        return true;
      },
    });

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: docRef.current.body,
        extensions: [
          // Hand-rolled "minimal setup" — intentionally WITHOUT CM's
          // defaultHighlightStyle (which underlines headings); our custom
          // codeHighlightStyle replaces it for fenced-code tokens only.
          highlightSpecialChars(),
          history(),
          drawSelection(),
          EditorView.lineWrapping,
          syntaxHighlighting(codeHighlightStyle),
          // Notion-style "/" slash menu. Slash menu's own keys (Enter/arrows)
          // come first via completionKeymap so they win while the popup is open.
          autocompletion({
            override: [makeSlashCommands(baseDir)],
            addToOptions: slashAddToOptions,
            icons: false,
            defaultKeymap: false,
            activateOnTyping: true,
          }),
          keymap.of([
            ...completionKeymap,
            // Tab / Shift-Tab: indent / outdent list items (and prose), capped.
            // Placed before defaultKeymap so it owns Tab in the editor.
            { key: "Tab", run: indentCommand, shift: dedentCommand },
            // Markdown list/quote continuation (falls through when N/A).
            { key: "Enter", run: insertNewlineContinueMarkup },
            { key: "Backspace", run: deleteMarkupBackward },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          // GFM (tables, strikethrough, task lists, autolinks) + lazy code-block
          // language highlighting via @codemirror/language-data.
          markdown({ base: markdownLanguage, codeLanguages: languages }),
          livePreview(baseDir),
          imageHandlers,
          flashField,
          editorTheme,
          cmPlaceholder(tt("markdownEditor.placeholder")),
          updateListener,
          selectionListener,
          EditorView.contentAttributes.of({
            spellcheck: "false",
            "aria-label": tt("markdownEditor.ariaLabel"),
          }),
        ],
      }),
    });
    viewRef.current = view;
    dirtyRef.current = false;

    // Report the line at the top of the viewport (rAF-throttled) so a ToC can
    // highlight the section in view (DEC-057).
    let scrollRaf = 0;
    const emitScrollLine = () => {
      scrollRaf = 0;
      const top = view.scrollDOM.scrollTop;
      try {
        const block = view.lineBlockAtHeight(top + 1);
        const line = view.state.doc.lineAt(block.from).number;
        onScrollLineRef.current?.(line);
      } catch {
        /* doc briefly empty during teardown */
      }
    };
    const onScroll = () => {
      if (scrollRaf) return;
      scrollRaf = window.requestAnimationFrame(emitScrollLine);
    };
    view.scrollDOM.addEventListener("scroll", onScroll, { passive: true });
    window.requestAnimationFrame(emitScrollLine); // initial

    // Live change flash (DEC-012 §7): on mount, paint the changed lines and clear
    // them after the fade. `flashLines` is fixed for this mounted instance (the
    // parent remounts via key on each external reload), so reading the closed-over
    // prop here is correct.
    if (flashLines && flashLines.length > 0) {
      view.dispatch({ effects: setFlashLines.of(flashLines) });
      // Jump to the FIRST changed line so the user lands on what the agent just
      // changed (DEC-057), not the top of the doc.
      const firstLine = Math.min(
        ...flashLines.filter((n) => n >= 1 && n <= view.state.doc.lines),
      );
      if (Number.isFinite(firstLine)) {
        const pos = view.state.doc.line(firstLine).from;
        view.dispatch({
          effects: EditorView.scrollIntoView(pos, { y: "center" }),
        });
      }
      // Clear after the settle animation (cm-ai-settle 3.2s) completes.
      flashTimerRef.current = window.setTimeout(() => {
        flashTimerRef.current = null;
        viewRef.current?.dispatch({ effects: setFlashLines.of([]) });
      }, 3400);
    }

    return () => {
      if (flashTimerRef.current !== null) {
        window.clearTimeout(flashTimerRef.current);
        flashTimerRef.current = null;
      }
      if (scrollRaf) window.cancelAnimationFrame(scrollRaf);
      view.scrollDOM.removeEventListener("scroll", onScroll);
      // Best-effort autosave flush before teardown (opt-in). Fire-and-forget:
      // save() reads viewRef BEFORE we destroy, so the latest text is captured.
      if (flushOnUnmountRef.current && dirtyRef.current) {
        void saveRef.current();
      }
      view.destroy();
      viewRef.current = null;
    };
    // Mount-once: the parent remounts on doc switch / reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = React.useCallback(async () => {
    const d = docRef.current;
    const fmDirty = Boolean(fmDirtyRef.current);
    const current = viewRef.current?.state.doc.toString() ?? d.body;
    const bodyChanged = current !== d.body;

    // Zero-diff: nothing edited -> write the ORIGINAL bytes back unchanged.
    if (!bodyChanged && !fmDirty) {
      await writeFile(d.path, `${d.rawFrontmatter ?? ""}${d.body}`);
      return;
    }

    const fmBlock = fmDirty
      ? emitFrontmatter(fmRef.current)
      : (d.rawFrontmatter ?? "");

    await writeFile(d.path, `${fmBlock}${current}`);
    markDirty(false);
    onSavedRef.current?.();
  }, [markDirty]);

  // Keep the unmount-flush path pointed at the latest save closure.
  React.useEffect(() => {
    saveRef.current = save;
  }, [save]);

  React.useImperativeHandle(
    ref,
    () => ({
      save,
      isDirty: () => dirtyRef.current,
      getText: () => viewRef.current?.state.doc.toString() ?? docRef.current.body,
      clearDirty: () => markDirty(false),
      scrollToLine: (line: number) => {
        const view = viewRef.current;
        if (!view) return;
        const ln = Math.min(Math.max(1, Math.round(line)), view.state.doc.lines);
        const pos = view.state.doc.line(ln).from;
        view.dispatch({
          selection: { anchor: pos },
          effects: EditorView.scrollIntoView(pos, { y: "start", yMargin: 28 }),
        });
        view.focus();
      },
    }),
    [save, markDirty],
  );

  const submitComment = () => {
    const c = commentDraft.trim();
    if (!c || !selComment) return;
    onCommentRef.current?.(selComment.text, c);
    setCommentDraft("");
    setCommentOpen(false);
    setSelComment(null);
  };

  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)}>
      <div ref={hostRef} className="h-full w-full overflow-hidden" />
      {selComment && onComment && (
        <div
          className="fixed z-50"
          style={{ top: Math.max(8, selComment.top - 40), left: selComment.left }}
        >
          {!commentOpen ? (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()} // keep the editor selection alive
              onClick={() => {
                setCommentOpen(true);
                setCommentDraft("");
              }}
              className="flex h-7 items-center gap-1 rounded-md border bg-popover px-2 text-[11px] font-medium text-foreground shadow-md hover:bg-muted"
            >
              <MessageSquarePlus className="size-3.5 text-primary" />
              {tt("editorComment.button")}
            </button>
          ) : (
            <div className="w-64 rounded-md border bg-popover p-2 shadow-lg">
              <div className="mb-1 line-clamp-2 rounded bg-muted px-1.5 py-1 text-[10px] text-muted-foreground">
                “{selComment.text.slice(0, 120)}
                {selComment.text.length > 120 ? "…" : ""}”
              </div>
              <textarea
                autoFocus
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || !e.shiftKey)) {
                    e.preventDefault();
                    submitComment();
                  } else if (e.key === "Escape") {
                    setCommentOpen(false);
                  }
                }}
                rows={2}
                placeholder={tt("editorComment.placeholder")}
                className="w-full resize-none rounded border bg-background p-1.5 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <div className="mt-1.5 flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setCommentOpen(false)}
                  className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
                >
                  {tt("editorComment.cancel")}
                </button>
                <button
                  type="button"
                  onClick={submitComment}
                  disabled={!commentDraft.trim()}
                  className="rounded bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {tt("editorComment.add")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const MarkdownEditor = React.forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  MarkdownEditorInner,
);
MarkdownEditor.displayName = "MarkdownEditor";

export default MarkdownEditor;
