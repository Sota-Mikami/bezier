// FROZEN CONTRACT — signatures are frozen. Bodies are minimal compiling stubs;
// Agent A implements the real markdown <-> Plate round-trip.
//
// Headless / node-safe: createSlateEditor has no DOM and runs in plain node,
// which powers the round-trip test (scripts/roundtrip.mjs).

import { createSlateEditor, type SlateEditor } from "platejs";
import type { Frontmatter } from "@/lib/frontmatter";

/**
 * Create a headless Slate editor configured for markdown round-tripping.
 * Stub: a bare editor. Agent A adds the markdown plugin + remark-gfm.
 */
export function makeMdEditor(): SlateEditor {
  return createSlateEditor();
}

/** Markdown body -> Plate value. Stub returns []. */
export function mdToPlate(_body: string): unknown[] {
  return [];
}

/** Plate value -> Markdown body. Stub returns "". */
export function plateToMd(_value: unknown[]): string {
  return "";
}

/**
 * Split a document into its leading frontmatter block and body.
 * Preserve the raw `---...---` block byte-for-byte (rawFrontmatter); only the
 * parsed `data` is typed. Stub: treats the whole text as body.
 * Agent A implements gray-matter PARSE + byte-preserving split.
 */
export function splitFrontmatter(text: string): {
  rawFrontmatter: string | null;
  data: Frontmatter;
  body: string;
} {
  return { rawFrontmatter: null, data: {}, body: text };
}

/**
 * Decide whether a body can round-trip through Plate ("plate") or must be
 * edited as raw text ("raw" if non-idempotent, or contains real JSX/HTML/
 * footnotes). Stub returns "plate".
 */
export function classify(_body: string): "plate" | "raw" {
  return "plate";
}
