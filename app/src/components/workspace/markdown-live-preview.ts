// Obsidian-style "Live Preview" for CodeMirror 6.
//
// The document is rendered FORMATTED by default; the line(s) under the current
// selection reveal their RAW markdown syntax so you edit the source inline. The
// source of truth is the markdown TEXT itself — there is no node tree and no
// serialization round-trip (cf. DEC-010). This module walks the Lezer markdown
// syntax tree (syntaxTree(state)) and builds two RangeSets:
//
//   • `deco`   — what the editor draws: Decoration.mark (style content),
//                Decoration.replace (hide punctuation / swap a block widget),
//                Decoration.line (size headings, band code blocks, quote bars).
//   • `atomic` — only the BLOCK-widget replace ranges (table / hr), fed to
//                EditorView.atomicRanges so the caret treats a rendered block as
//                one unit. Inline hidden marks are deliberately NOT atomic, so
//                cursor movement and text selection stay natural (Obsidian-style).
//
// Reveal-on-cursor: a punctuation range is HIDDEN (replace) when it does not
// intersect the selection's active line(s), and DIMMED (a muted mark, i.e. shown
// as source) when it does. Block widgets (hr / table) render off-cursor and fall
// back to raw source when the selection enters their range. Because this lives in
// a StateField (NOT a ViewPlugin), it may emit block decorations — CM6 forbids
// block decorations from plugins — and it recomputes on every transaction so the
// reveal tracks the caret and any async parser progress.

import { StateField, type Extension, type Range, type EditorState } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { readFileBytes } from "@/lib/ipc";

// --- Inline image rendering (DEC-043 #1) ---------------------------------
// Spec images (`![alt](assets/foo.png)`) render inline in the live preview.
// Local relative paths are resolved against the doc's directory (`baseDir`),
// read as bytes, and turned into a data: URL (avoids needing the Tauri asset
// protocol). Results are cached by absolute path so recomputes don't re-read.

const imageCache = new Map<string, string>(); // absPath/url -> data URL ("" = failed)

function mimeFromPath(p: string): string {
  switch (p.split(".").pop()?.toLowerCase()) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "avif":
      return "image/avif";
    case "bmp":
      return "image/bmp";
    default:
      return "application/octet-stream";
  }
}

/** Base64-encode bytes in chunks (avoids a stack overflow on large images). */
function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/** Resolve a markdown image URL to a loadable source (absolute file path for
 * local relatives; passthrough for http/https/data). */
function resolveImageSrc(url: string, baseDir?: string): string {
  if (/^(https?:|data:|asset:|file:)/i.test(url)) return url;
  if (url.startsWith("/")) return url; // already absolute path
  const clean = url.replace(/^\.\//, "");
  const base = baseDir ? baseDir.replace(/\/+$/, "") : "";
  return base ? `${base}/${clean}` : clean;
}

/** Load an image source to a renderable URL (data: for local files). Cached. */
async function loadImageSrc(src: string): Promise<string | null> {
  if (/^(https?:|data:)/i.test(src)) return src;
  const cached = imageCache.get(src);
  if (cached !== undefined) return cached || null;
  try {
    const bytes = await readFileBytes(src);
    const url = `data:${mimeFromPath(src)};base64,${toBase64(bytes)}`;
    imageCache.set(src, url);
    return url;
  } catch {
    imageCache.set(src, "");
    return null;
  }
}

/** An inline-rendered image (`![alt](url)`), loaded asynchronously. `src` is the
 * already-resolved source (absolute file path or http/data URL). */
class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
  ) {
    super();
  }
  eq(other: ImageWidget) {
    return other.src === this.src && other.alt === this.alt;
  }
  toDOM() {
    const wrap = document.createElement("span");
    wrap.className = "cm-md-image";
    const img = document.createElement("img");
    if (this.alt) img.alt = this.alt;
    void loadImageSrc(this.src).then((url) => {
      if (url) {
        img.src = url;
      } else {
        wrap.classList.add("cm-md-image-missing");
        wrap.textContent = `🖼 ${this.alt || this.src.split("/").pop() || "画像"}（読み込めません）`;
      }
    });
    wrap.appendChild(img);
    return wrap;
  }
  // Let clicks reach the editor so the caret can enter and reveal the source.
  ignoreEvent() {
    return false;
  }
}

// --- Shared decoration singletons ----------------------------------------

/** Replace a range with nothing (hide syntax punctuation off-cursor). */
const hiddenMark = Decoration.replace({});
/** Show syntax punctuation on the active line, dimmed (Obsidian-style). */
const dimMark = Decoration.mark({ class: "cm-md-syntax" });

const strongMark = Decoration.mark({ class: "cm-md-strong" });
const emMark = Decoration.mark({ class: "cm-md-em" });
const strikeMark = Decoration.mark({ class: "cm-md-strike" });
const inlineCodeMark = Decoration.mark({ class: "cm-md-inline-code" });
const linkMark = Decoration.mark({ class: "cm-md-link" });
const fenceMark = Decoration.mark({ class: "cm-md-fence" });

const quoteLine = Decoration.line({ class: "cm-md-blockquote" });
const codeLine = Decoration.line({ class: "cm-md-codeblock" });
const headingLines = [1, 2, 3, 4, 5, 6].map((lvl) =>
  Decoration.line({ class: `cm-md-h${lvl}` }),
);

// --- Block / replacement widgets -----------------------------------------

/** A clean bullet glyph that replaces a raw `-`/`*`/`+` list marker off-cursor. */
class BulletWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-md-bullet";
    span.textContent = "•";
    return span;
  }
}
const bulletWidget = new BulletWidget();

/** A rendered, CLICKABLE checkbox that replaces a `[ ]`/`[x]` task marker
 * off-cursor. Clicking toggles the marker text in the document (DEC-042). */
class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly from: number,
    readonly to: number,
  ) {
    super();
  }
  eq(other: CheckboxWidget) {
    return other.checked === this.checked && other.from === this.from;
  }
  toDOM(view: EditorView) {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = this.checked;
    input.className = "cm-md-checkbox";
    input.addEventListener("mousedown", (e) => e.preventDefault());
    input.addEventListener("change", () => {
      view.dispatch({
        changes: {
          from: this.from,
          to: this.to,
          insert: this.checked ? "[ ]" : "[x]",
        },
      });
    });
    return input;
  }
  // Handle our own clicks (don't let CM move the caret onto the marker).
  ignoreEvent() {
    return true;
  }
}

/** A rendered horizontal rule that replaces `---`/`***`/`___` off-cursor. */
class HrWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const wrap = document.createElement("div");
    wrap.className = "cm-md-hr";
    wrap.appendChild(document.createElement("hr"));
    return wrap;
  }
  // Let clicks reach the editor so the caret lands at the rule and reveals it.
  ignoreEvent() {
    return false;
  }
}
const hrWidget = new HrWidget();

/** A real bordered <table> built from the raw GFM pipe source. */
class TableWidget extends WidgetType {
  constructor(readonly source: string) {
    super();
  }
  eq(other: TableWidget) {
    return other.source === this.source;
  }
  ignoreEvent() {
    return false;
  }
  toDOM() {
    // Wrap the <table> in a block div whose PADDING provides the vertical gap.
    // A block-widget root's margin escapes CM6's height measurement (drifting
    // the caret below the table); padding on the wrapper is measured correctly.
    const wrap = document.createElement("div");
    wrap.className = "cm-md-tableblock";
    wrap.appendChild(renderTable(this.source));
    return wrap;
  }
}

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\" && i + 1 < s.length) {
      cur += s[i + 1];
      i++;
      continue;
    }
    if (c === "|") {
      cells.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

type Align = "left" | "center" | "right" | null;

function parseAlign(cell: string): Align {
  const t = cell.trim();
  const left = t.startsWith(":");
  const right = t.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return null;
}

function renderTable(source: string): HTMLElement {
  const lines = source.split("\n").filter((l) => l.trim().length > 0);
  const table = document.createElement("table");
  table.className = "cm-md-table";
  if (lines.length === 0) return table;

  const header = splitRow(lines[0]);
  let aligns: Align[] = [];
  let bodyStart = 1;
  if (lines.length > 1 && /^[\s:|-]+$/.test(lines[1])) {
    aligns = splitRow(lines[1]).map(parseAlign);
    bodyStart = 2;
  }

  const thead = document.createElement("thead");
  const htr = document.createElement("tr");
  header.forEach((h, i) => {
    const th = document.createElement("th");
    th.textContent = h;
    const a = aligns[i];
    if (a) th.style.textAlign = a;
    htr.appendChild(th);
  });
  thead.appendChild(htr);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (let r = bodyStart; r < lines.length; r++) {
    const cells = splitRow(lines[r]);
    const tr = document.createElement("tr");
    for (let i = 0; i < header.length; i++) {
      const td = document.createElement("td");
      td.textContent = cells[i] ?? "";
      const a = aligns[i];
      if (a) td.style.textAlign = a;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

// --- Decoration builder ---------------------------------------------------

interface LivePreview {
  deco: DecorationSet;
  atomic: DecorationSet;
}

/** Line ranges (full lines) touched by any selection range. */
function activeRanges(state: EditorState): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  for (const r of state.selection.ranges) {
    const start = state.doc.lineAt(r.from);
    const end = state.doc.lineAt(r.to);
    out.push({ from: start.from, to: end.to });
  }
  return out;
}

function compute(state: EditorState, baseDir?: string): LivePreview {
  const deco: Range<Decoration>[] = [];
  const atomic: Range<Decoration>[] = [];
  const { doc } = state;
  const active = activeRanges(state);
  const isActive = (from: number, to: number) =>
    active.some((r) => from <= r.to && to >= r.from);

  // Hide a punctuation range off-cursor; show it dimmed (as source) on-cursor.
  const hideOrDim = (from: number, to: number) => {
    if (from >= to) return;
    if (isActive(from, to)) {
      deco.push(dimMark.range(from, to));
    } else {
      // Hide off-cursor, but DO NOT make inline marks atomic: atomic ranges make
      // the caret jump over hidden syntax as a unit and make text selection snap
      // to block units, which feels unnatural. Cursor/selection stay natural;
      // reveal-on-active-line still shows the source when you edit the line.
      deco.push(hiddenMark.range(from, to));
    }
  };

  const replaceBlock = (from: number, to: number, widget: WidgetType) => {
    const w = Decoration.replace({ widget, block: true });
    deco.push(w.range(from, to));
    atomic.push(w.range(from, to));
  };

  const tree = syntaxTree(state);
  tree.iterate({
    enter: (node) => {
      const { name, from, to } = node;

      // --- Headings: size the line, hide the leading/closing `#` marks. ---
      const atx = /^ATXHeading([1-6])$/.exec(name);
      if (atx) {
        const level = Number(atx[1]);
        const line = doc.lineAt(from);
        deco.push(headingLines[level - 1].range(line.from));
        return; // descend to hide HeaderMark children
      }
      if (name === "HeaderMark") {
        // Consume the single space that follows a leading `#` mark.
        let end = to;
        if (doc.sliceString(to, to + 1) === " ") end = to + 1;
        hideOrDim(from, end);
        return;
      }

      // --- Inline emphasis / code (style whole, hide the mark chars). ---
      if (name === "StrongEmphasis") {
        deco.push(strongMark.range(from, to));
        return;
      }
      if (name === "Emphasis") {
        deco.push(emMark.range(from, to));
        return;
      }
      if (name === "Strikethrough") {
        deco.push(strikeMark.range(from, to));
        return;
      }
      if (name === "EmphasisMark" || name === "StrikethroughMark") {
        hideOrDim(from, to);
        return;
      }
      if (name === "InlineCode") {
        deco.push(inlineCodeMark.range(from, to));
        return; // descend to hide the backtick CodeMark children
      }
      if (name === "CodeMark") {
        // Inline-code backticks only — fenced-code fences are handled (and
        // stopped) at the FencedCode node, so they never reach here.
        hideOrDim(from, to);
        return;
      }

      // --- Blockquote: left bar on every line, hide the `>` marks. ---
      if (name === "Blockquote") {
        const first = doc.lineAt(from).number;
        const last = doc.lineAt(to).number;
        for (let ln = first; ln <= last; ln++) {
          deco.push(quoteLine.range(doc.line(ln).from));
        }
        return; // descend to hide QuoteMark children
      }
      if (name === "QuoteMark") {
        let end = to;
        if (doc.sliceString(to, to + 1) === " ") end = to + 1;
        hideOrDim(from, end);
        return;
      }

      // --- Lists: clean bullet for unordered, keep the number for ordered. ---
      if (name === "ListMark") {
        const txt = doc.sliceString(from, to);
        if (/\d/.test(txt)) return; // ordered: leave "1." visible
        if (isActive(from, to)) {
          deco.push(dimMark.range(from, to));
        } else {
          // Non-atomic (see hideOrDim) so the caret moves naturally across the
          // bullet glyph.
          const w = Decoration.replace({ widget: bulletWidget });
          deco.push(w.range(from, to));
        }
        return;
      }

      // --- GFM task list: render a clickable checkbox for `[ ]` / `[x]`
      // off-cursor; show the raw marker (dimmed) on-cursor so it stays editable.
      if (name === "TaskMarker") {
        if (isActive(from, to)) {
          deco.push(dimMark.range(from, to));
        } else {
          const checked = /x/i.test(doc.sliceString(from, to));
          const w = Decoration.replace({
            widget: new CheckboxWidget(checked, from, to),
          });
          deco.push(w.range(from, to));
        }
        return;
      }

      // --- Image: render inline off-cursor, raw `![alt](url)` on-cursor. ---
      if (name === "Image") {
        if (isActive(from, to)) return false;
        const raw = doc.sliceString(from, to);
        const m = /^!\[([^\]]*)\]\(\s*<?([^\s)>]+)>?/.exec(raw);
        if (m) {
          const src = resolveImageSrc(m[2], baseDir);
          const w = Decoration.replace({ widget: new ImageWidget(src, m[1]) });
          deco.push(w.range(from, to));
        }
        return false;
      }

      // --- Links: show styled text off-cursor, full `[text](url)` on-cursor. ---
      if (name === "Link") {
        if (isActive(from, to)) return false;
        const marks = node.node.getChildren("LinkMark");
        if (marks.length >= 2) {
          const open = marks[0];
          const close = marks[1];
          hideOrDim(from, open.to); // `[`
          deco.push(linkMark.range(open.to, close.from)); // text
          hideOrDim(close.from, to); // `](url)`
        } else {
          deco.push(linkMark.range(from, to));
        }
        return false;
      }

      // --- Horizontal rule: render <hr> off-cursor, raw on-cursor. ---
      if (name === "HorizontalRule") {
        if (isActive(from, to)) return false;
        const line = doc.lineAt(from);
        replaceBlock(line.from, line.to, hrWidget);
        return false;
      }

      // --- GFM table: real <table> off-cursor, raw pipe source on-cursor. ---
      if (name === "Table") {
        if (isActive(from, to)) return false;
        const first = doc.lineAt(from);
        const last = doc.lineAt(to);
        const src = doc.sliceString(first.from, last.to);
        replaceBlock(first.from, last.to, new TableWidget(src));
        return false;
      }

      // --- Fenced code: band every line, dim the ``` fences + lang info. ---
      if (name === "FencedCode") {
        const first = doc.lineAt(from).number;
        const last = doc.lineAt(to).number;
        for (let ln = first; ln <= last; ln++) {
          deco.push(codeLine.range(doc.line(ln).from));
        }
        for (const cm of node.node.getChildren("CodeMark")) {
          deco.push(fenceMark.range(cm.from, cm.to));
        }
        const info = node.node.getChild("CodeInfo");
        if (info) deco.push(fenceMark.range(info.from, info.to));
        // Stop here: nested-language token highlighting is supplied separately
        // by syntaxHighlighting(defaultHighlightStyle) reading the same tree.
        return false;
      }

      return undefined;
    },
  });

  return {
    deco: Decoration.set(deco, true),
    atomic: Decoration.set(atomic, true),
  };
}

// --- Extension ------------------------------------------------------------

/**
 * Obsidian-style live-preview decorations for a markdown CodeMirror editor.
 * `baseDir` (the doc's directory) is used to resolve relative image paths
 * (`![](assets/x.png)`) to absolute files for inline rendering (DEC-043 #1).
 */
export function livePreview(baseDir?: string): Extension {
  const field = StateField.define<LivePreview>({
    create: (state) => compute(state, baseDir),
    // Recompute on every transaction so reveal-on-cursor tracks the caret AND any
    // async markdown parse progress is picked up. For markdown-note-sized docs the
    // single tree walk is sub-millisecond.
    update: (_value, tr) => compute(tr.state, baseDir),
    provide: (f) => [
      EditorView.decorations.from(f, (v) => v.deco),
      EditorView.atomicRanges.of((view) => view.state.field(f).atomic),
    ],
  });
  return [field];
}
