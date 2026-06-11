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
} from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { history, defaultKeymap, historyKeymap } from "@codemirror/commands";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { autocompletion, completionKeymap } from "@codemirror/autocomplete";
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
  slashCommands,
  slashAddToOptions,
} from "@/components/workspace/markdown-slash-commands";
import { cn } from "@/lib/utils";

export interface MarkdownEditorHandle {
  /** Persist the document to disk. Zero-diff when nothing was edited. */
  save: () => Promise<void>;
  /** Whether the editor body has unsaved edits. */
  isDirty: () => boolean;
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
    className,
  } = props;

  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const viewRef = React.useRef<EditorView | null>(null);

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
  const flushOnUnmountRef = React.useRef(flushOnUnmount);
  const saveRef = React.useRef<() => Promise<void>>(async () => {});
  React.useEffect(() => {
    docRef.current = doc;
    fmRef.current = frontmatter;
    fmDirtyRef.current = frontmatterDirty;
    onSavedRef.current = onSaved;
    onDirtyRef.current = onDirtyChange;
    onEditRef.current = onEdit;
    flushOnUnmountRef.current = flushOnUnmount;
  });

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
            override: [slashCommands],
            addToOptions: slashAddToOptions,
            icons: false,
            defaultKeymap: false,
            activateOnTyping: true,
          }),
          keymap.of([
            ...completionKeymap,
            // Markdown list/quote continuation (falls through when N/A).
            { key: "Enter", run: insertNewlineContinueMarkup },
            { key: "Backspace", run: deleteMarkupBackward },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          // GFM (tables, strikethrough, task lists, autolinks) + lazy code-block
          // language highlighting via @codemirror/language-data.
          markdown({ base: markdownLanguage, codeLanguages: languages }),
          livePreview,
          editorTheme,
          cmPlaceholder("Start writing…  (type / for commands)"),
          updateListener,
          EditorView.contentAttributes.of({
            spellcheck: "false",
            "aria-label": "Markdown editor",
          }),
        ],
      }),
    });
    viewRef.current = view;
    dirtyRef.current = false;

    return () => {
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
    () => ({ save, isDirty: () => dirtyRef.current }),
    [save],
  );

  return (
    <div
      ref={hostRef}
      className={cn("h-full w-full overflow-hidden", className)}
    />
  );
}

const MarkdownEditor = React.forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  MarkdownEditorInner,
);
MarkdownEditor.displayName = "MarkdownEditor";

export default MarkdownEditor;
