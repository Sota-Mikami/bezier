// FROZEN CONTRACT — signatures are frozen. This file implements the real
// markdown <-> Plate round-trip on top of platejs (createSlateEditor) +
// @platejs/markdown (MarkdownPlugin) configured with remark-gfm.
//
// Headless / node-safe: createSlateEditor has no DOM and runs in plain node,
// which powers the round-trip test (scripts/roundtrip.mjs).

import { createSlateEditor, type SlateEditor, type Value, type Descendant } from "platejs";
import { MarkdownPlugin } from "@platejs/markdown";
import { BaseListPlugin } from "@platejs/list";
import remarkGfm from "remark-gfm";
import matter from "gray-matter";
import type { Frontmatter } from "@/lib/frontmatter";

// The MarkdownPlugin augments editor.api with `markdown`, but that augmentation
// is only inferred when plugins are passed with full generic typing. For the
// headless editor (plain plugin array) we narrow the api shape explicitly.
interface MarkdownApi {
  deserialize: (data: string, options?: Record<string, unknown>) => Value;
  serialize: (options?: { value?: Descendant[] } & Record<string, unknown>) => string;
}
function mdApi(editor: SlateEditor): MarkdownApi {
  return (editor.api as unknown as { markdown: MarkdownApi }).markdown;
}

/**
 * remark-stringify options shared by every code path so that the editor used
 * by the UI and the headless round-trip test serialize identically. Locking
 * bullets/emphasis/strong/indent down is what makes round-trips idempotent.
 */
const REMARK_STRINGIFY_OPTIONS = {
  bullet: "-" as const,
  emphasis: "*" as const,
  strong: "*" as const,
  listItemIndent: "one" as const,
  rule: "-" as const,
  fences: true as const,
};

/**
 * The single, reusable MarkdownPlugin configuration. The UI editor and the
 * headless editor MUST share this so behavior is identical.
 */
const markdownPlugin = MarkdownPlugin.configure({
  options: {
    remarkPlugins: [remarkGfm],
    remarkStringifyOptions: REMARK_STRINGIFY_OPTIONS,
  },
});

/**
 * Create a headless Slate editor configured for markdown round-tripping.
 * Same plugin list the UI editor should mount.
 */
export function makeMdEditor(): SlateEditor {
  return createSlateEditor({
    // BaseListPlugin (key: "list") makes the markdown package use the
    // indent-list model, which both deserialize AND serialize handle
    // consistently. Without it, lists deserialize to classic ul/li nodes that
    // the default serializer cannot reproduce (they vanish).
    plugins: [BaseListPlugin, markdownPlugin],
  });
}

// A single shared editor instance is fine for headless (de)serialization:
// the API is stateless w.r.t. the editor's current value because we pass
// `value` explicitly on serialize and read the returned value on deserialize.
let sharedEditor: SlateEditor | null = null;
function getEditor(): SlateEditor {
  if (sharedEditor == null) sharedEditor = makeMdEditor();
  return sharedEditor;
}

/** Markdown body -> Plate value. */
export function mdToPlate(body: string): unknown[] {
  const editor = getEditor();
  return mdApi(editor).deserialize(body) as unknown[];
}

/** Plate value -> Markdown body. */
export function plateToMd(value: unknown[]): string {
  const editor = getEditor();
  return mdApi(editor).serialize({ value: value as Descendant[] });
}

// Leading frontmatter block: optional BOM, then a --- fenced YAML block.
const FRONTMATTER_RE = /^(﻿?)(---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$))/;

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function asStringArray(v: unknown): string[] | undefined {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  return undefined;
}

/**
 * Normalize a YAML-parsed Date back to a string.
 * A date-only scalar (e.g. `created: 2026-06-08`) is parsed by the YAML reader
 * as midnight UTC; reproduce it as `YYYY-MM-DD` so the field both displays and
 * (when frontmatter is edited) re-serializes identically to the source instead
 * of leaking a full ISO timestamp (`2026-06-08T00:00:00.000Z`). Only fall back
 * to full ISO when an actual time component is present.
 */
function dateToYamlString(d: Date): string {
  const iso = d.toISOString();
  return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso;
}

/**
 * Map an arbitrary parsed YAML object to the typed Frontmatter shape.
 * PARSE-side only; never used to serialize back.
 */
function toFrontmatter(data: Record<string, unknown> | null | undefined): Frontmatter {
  if (!data || typeof data !== "object") return {};
  const fm: Frontmatter = {};
  const title = asString(data.title);
  if (title !== undefined) fm.title = title;
  const type = asString(data.type);
  if (type !== undefined) fm.type = type;
  const status = asString(data.status);
  if (status !== undefined) fm.status = status;
  // `created` may be parsed by gray-matter as a Date; normalize to string.
  if (data.created instanceof Date) fm.created = dateToYamlString(data.created);
  else {
    const created = asString(data.created);
    if (created !== undefined) fm.created = created;
  }
  const links = asStringArray(data.links);
  if (links !== undefined) fm.links = links;
  return fm;
}

/**
 * Split a document into its leading frontmatter block and body.
 * Preserves the raw `---...---` block byte-for-byte (rawFrontmatter); only the
 * parsed `data` is typed. Uses gray-matter for PARSE only (never stringify).
 */
export function splitFrontmatter(text: string): {
  rawFrontmatter: string | null;
  data: Frontmatter;
  body: string;
} {
  const match = FRONTMATTER_RE.exec(text);
  if (!match) {
    return { rawFrontmatter: null, data: {}, body: text };
  }

  const bom = match[1] ?? "";
  const rawBlock = match[2];
  const rawFrontmatter = bom + rawBlock;
  const body = text.slice(rawFrontmatter.length);

  let data: Frontmatter = {};
  try {
    // gray-matter PARSE only — extract the typed fields. We never serialize
    // back via gray-matter; the raw block above is preserved verbatim.
    const parsed = matter(text);
    data = toFrontmatter(parsed.data as Record<string, unknown>);
  } catch {
    data = {};
  }

  return { rawFrontmatter, data, body };
}

/**
 * Heuristic markers that make a body unsafe for Plate round-tripping in v0.1.
 * Real JSX/HTML and footnotes are not faithfully reproduced, so such files are
 * edited as raw text.
 */
function hasRawOnlyConstructs(body: string): boolean {
  // Footnote reference [^id] or definition [^id]:
  if (/\[\^[^\]]+\]/.test(body)) return true;

  // Strip fenced + inline code so HTML/JSX *inside* code blocks doesn't count.
  const withoutFenced = body
    .replace(/```[\s\S]*?```/g, "")
    .replace(/~~~[\s\S]*?~~~/g, "");
  const withoutCode = withoutFenced.replace(/`[^`]*`/g, "");

  // Real HTML/JSX tags: <div>, <Foo />, <br/>, closing tags, etc.
  // A tag must start with a letter; this excludes markdown autolinks like
  // <https://...> (start with a scheme) but matches actual elements.
  const tagRe = /<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*)?\/?>/;
  if (tagRe.test(withoutCode)) return true;

  return false;
}

/**
 * Decide whether a body can round-trip through Plate ("plate") or must be
 * edited as raw text ("raw" if non-idempotent, or contains real JSX/HTML/
 * footnotes).
 */
export function classify(body: string): "plate" | "raw" {
  if (hasRawOnlyConstructs(body)) return "raw";

  try {
    const value = mdToPlate(body);
    const out = plateToMd(value);
    // Fixed-point check: re-running the pipeline on the serialized output must
    // produce identical bytes.
    const out2 = plateToMd(mdToPlate(out));
    if (out !== out2) return "raw";
    return "plate";
  } catch {
    return "raw";
  }
}
