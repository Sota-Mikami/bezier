// Notion-style "/" slash command menu for the markdown CodeMirror editor.
//
// A CompletionSource (@codemirror/autocomplete) that triggers when the user
// types "/" at the start of a block or after whitespace (Notion's behavior),
// shows a filterable list of block templates, and on selection replaces the
// "/query" with the corresponding markdown — placing the caret sensibly.
//
// Rows are rendered Notion-style (icon tile + title + description) via the
// autocompletion `addToOptions` hook: `slashAddToOptions` injects an icon node
// (before CM's default label = the title) and a description node (after it).
// CM keeps rendering the label, so fuzzy match-highlighting still works; CSS in
// markdown-editor.tsx lays the three out as a grid.

import type { EditorView } from "@codemirror/view";
import type {
  Completion,
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete";
import { pickAndInsertImages } from "@/components/workspace/markdown-images";

// Sentinel marking where the caret should land inside a template (stripped
// before insertion). NUL never appears in real markdown source.
const CARET = "\u0000";

/**
 * Build an `apply` that replaces the whole "/query" (the slash is one char
 * before the completion's `from`) with `template`, then positions the caret at
 * the CARET marker (or end of the inserted text when there is none).
 */
function applyTemplate(template: string) {
  return (view: EditorView, _completion: Completion, from: number, to: number) => {
    const markerAt = template.indexOf(CARET);
    const insert = template.replace(CARET, "");
    const slashFrom = from - 1; // also remove the leading "/"
    const caret =
      markerAt >= 0 ? slashFrom + markerAt : slashFrom + insert.length;
    view.dispatch({
      changes: { from: slashFrom, to, insert },
      selection: { anchor: caret },
      scrollIntoView: true,
      userEvent: "input.complete",
    });
  };
}

/**
 * Apply for the Image command: remove the "/image" query, then open the native
 * image picker and insert the chosen file(s) at that position (DEC-044).
 */
function applyImage(baseDir: string) {
  return (view: EditorView, _completion: Completion, from: number, to: number) => {
    const slashFrom = from - 1; // also remove the leading "/"
    view.dispatch({
      changes: { from: slashFrom, to, insert: "" },
      selection: { anchor: slashFrom },
      userEvent: "input.complete",
    });
    void pickAndInsertImages(view, baseDir, slashFrom);
  };
}

// --- Icons (lucide paths, inlined as SVG markup) --------------------------
// lucide-react is a dep, but the autocomplete renders raw DOM, so we inline the
// lucide path data. 24x24 viewBox, stroke = currentColor (the tile sets color).

function svg(paths: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" ` +
    `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ` +
    `stroke-linejoin="round" aria-hidden="true">${paths}</svg>`
  );
}

const ICONS = {
  // Heading1
  h1: svg('<path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="m17 12 3-2v8"/>'),
  // Heading2
  h2: svg('<path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1"/>'),
  // Heading3
  h3: svg('<path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2"/><path d="M17 17.5c2 1.5 4 .3 4-1.5a2 2 0 0 0-2-2"/>'),
  // List
  bullet: svg('<path d="M3 5h.01"/><path d="M3 12h.01"/><path d="M3 19h.01"/><path d="M8 5h13"/><path d="M8 12h13"/><path d="M8 19h13"/>'),
  // ListOrdered
  ordered: svg('<path d="M10 5h11"/><path d="M10 12h11"/><path d="M10 19h11"/><path d="M4 4h1v4"/><path d="M4 8h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>'),
  // SquareCheckBig (to-do)
  todo: svg('<path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'),
  // Quote
  quote: svg('<path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v1a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/><path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v1a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/>'),
  // Code
  code: svg('<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>'),
  // Table
  table: svg('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M12 3v18"/>'),
  // Minus (divider)
  divider: svg('<path d="M5 12h14"/>'),
  // ImagePlus (insert image)
  image: svg('<path d="M16 5h6"/><path d="M19 2v6"/><path d="M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/><circle cx="9" cy="9" r="2"/>'),
} as const;

// --- Command catalogue -----------------------------------------------------

interface SlashItem {
  /** Title (also the filter key — CM matches the query against this). */
  title: string;
  /** Short Notion-style explanation shown under the title. */
  description: string;
  /** Inline SVG markup for the left icon tile. */
  icon: string;
  /** Inserted markdown; CARET marks the resting caret position. */
  template: string;
}

const ITEMS: SlashItem[] = [
  { title: "Heading 1", description: "Large section heading", icon: ICONS.h1, template: "# " },
  { title: "Heading 2", description: "Medium section heading", icon: ICONS.h2, template: "## " },
  { title: "Heading 3", description: "Small section heading", icon: ICONS.h3, template: "### " },
  { title: "Bullet list", description: "Simple bulleted list", icon: ICONS.bullet, template: "- " },
  { title: "Numbered list", description: "List with numbering", icon: ICONS.ordered, template: "1. " },
  { title: "To-do list", description: "Track tasks with checkboxes", icon: ICONS.todo, template: "- [ ] " },
  { title: "Quote", description: "Capture a quote", icon: ICONS.quote, template: "> " },
  {
    title: "Code block",
    description: "Code with syntax highlighting",
    icon: ICONS.code,
    template: "```\n" + CARET + "\n```",
  },
  {
    title: "Table",
    description: "Add a simple table",
    icon: ICONS.table,
    template: "| " + CARET + " |  |\n| --- | --- |\n|  |  |",
  },
  { title: "Divider", description: "Visually separate blocks", icon: ICONS.divider, template: "---\n" + CARET },
];

interface SlashMeta {
  description: string;
  icon: string;
}

// Image is special: it has no template — selecting it opens the native picker
// and inserts the chosen file(s) via the doc's assets/ dir (DEC-044). Its apply
// needs the doc directory, so options are built per-editor (makeSlashCommands).
const IMAGE_TITLE = "Image";
const IMAGE_META: SlashMeta = {
  description: "Insert an image from a file",
  icon: ICONS.image,
};

// Parallel metadata keyed by the completion label, read by the row renderers.
const META = new Map<string, SlashMeta>([
  ...ITEMS.map(
    (it) => [it.title, { description: it.description, icon: it.icon }] as const,
  ),
  [IMAGE_TITLE, IMAGE_META],
]);

/** Build the option list for an editor whose doc lives in `baseDir` (needed by
 * the Image command). Template commands are base-dir-independent. */
function buildOptions(baseDir: string): Completion[] {
  return [
    ...ITEMS.map((it) => ({
      // `label` is the filter key + CM's default-rendered title (keeps match
      // highlighting). Detail/type are omitted so no default detail/icon node
      // double-renders alongside our custom row content.
      label: it.title,
      apply: applyTemplate(it.template),
    })),
    { label: IMAGE_TITLE, apply: applyImage(baseDir) },
  ];
}

// --- Notion-style row rendering (addToOptions) -----------------------------

function renderIcon(completion: Completion): Node | null {
  const meta = META.get(completion.label);
  if (!meta) return null;
  const tile = document.createElement("div");
  tile.className = "cm-slash-icon";
  tile.innerHTML = meta.icon;
  return tile;
}

function renderDescription(completion: Completion): Node | null {
  const meta = META.get(completion.label);
  if (!meta) return null;
  const el = document.createElement("div");
  el.className = "cm-slash-desc";
  el.textContent = meta.description;
  return el;
}

/**
 * Extra row content for `autocompletion({ addToOptions })`. The icon is placed
 * before CM's default label (position 50) and the description after it; CSS
 * arranges icon | (title / description) as a grid.
 */
export const slashAddToOptions: {
  render: (completion: Completion) => Node | null;
  position: number;
}[] = [
  { render: renderIcon, position: 10 },
  { render: renderDescription, position: 70 },
];

/**
 * Build a slash-command completion source for an editor whose doc lives in
 * `baseDir` (so the Image command can save into <baseDir>/assets/). Returns
 * options when the caret follows a "/" that begins a block or follows
 * whitespace; CM filters the options by the text typed after the slash, so the
 * growing command list stays keyword-searchable.
 */
export function makeSlashCommands(baseDir: string) {
  const options = buildOptions(baseDir);
  return (context: CompletionContext): CompletionResult | null => {
    const before = context.matchBefore(/\/[\w-]*/);
    if (!before) return null;

    // Notion-style trigger: the "/" must start the line or follow whitespace.
    const slashPos = before.from;
    const prev =
      slashPos > 0 ? context.state.doc.sliceString(slashPos - 1, slashPos) : "";
    if (prev !== "" && !/\s/.test(prev)) return null;

    return {
      // Filter/replace region is the query AFTER the slash, so options are
      // matched against e.g. "head" (not "/head"); `apply` removes the slash.
      from: before.from + 1,
      options,
      validFor: /^[\w-]*$/,
    };
  };
}
