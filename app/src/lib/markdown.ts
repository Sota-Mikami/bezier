// Frontmatter split/parse helpers for the workspace + issues stores.
//
// Markdown bodies are edited as TEXT by the CodeMirror MarkdownEditor (DEC-010),
// so there is no Plate node tree and no markdown round-trip here anymore — this
// file only splits the leading YAML frontmatter from the body and parses the
// typed fields. The raw frontmatter block is preserved byte-for-byte; only the
// parsed `data` is typed. gray-matter is used for PARSE only (never stringify).

import matter from "gray-matter";
import type { Frontmatter } from "@/lib/frontmatter";

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
