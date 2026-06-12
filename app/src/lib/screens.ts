// FROZEN CONTRACT — Canvas SoR (System of Record) for v0.3.
// Persisted to <root>/.bezier/screens.json via ipc readFile/writeFile.
// Shapes and signatures are frozen. Do NOT redefine. All Canvas modules
// import from this file.

import { readFile, writeFile } from "@/lib/ipc";

export type ScreenSource =
  | { type: "url"; url: string }
  | { type: "html"; path: string }
  | { type: "scenegraph"; path: string }
  // v0.4 — editable React+Tailwind app served by a (cooperating) dev server.
  //   url      = the dev-server URL shown in the iframe
  //   repoPath = local repo root used for Onlook-style AST write-back
  | { type: "react-repo"; url: string; repoPath: string };

export interface Screen {
  id: string;
  label: string;
  source: ScreenSource;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ScreensDoc {
  schema: "1";
  screens: Screen[];
}

/** Path to the screens SoR within a workspace root. */
function screensPath(root: string): string {
  // POSIX-style join; root has no trailing slash by convention.
  return `${root}/.bezier/screens.json`;
}

/**
 * Read <root>/.bezier/screens.json.
 * If missing (or unreadable), return an empty doc {schema:"1",screens:[]}.
 */
export async function loadScreens(root: string): Promise<ScreensDoc> {
  try {
    const raw = await readFile(screensPath(root));
    const parsed = JSON.parse(raw) as ScreensDoc;
    if (!parsed || parsed.schema !== "1" || !Array.isArray(parsed.screens)) {
      return { schema: "1", screens: [] };
    }
    return parsed;
  } catch {
    return { schema: "1", screens: [] };
  }
}

/**
 * Write the screens doc to <root>/.bezier/screens.json (pretty-printed,
 * stable key order so it round-trips cleanly in Git). writeFile is expected
 * to create the .bezier directory if needed.
 */
export async function saveScreens(root: string, doc: ScreensDoc): Promise<void> {
  const ordered: ScreensDoc = {
    schema: "1",
    screens: doc.screens.map((s) => normalizeScreen(s)),
  };
  const json = JSON.stringify(ordered, null, 2);
  await writeFile(screensPath(root), json + "\n");
}

/** Enforce a stable key order on a screen for deterministic serialization. */
function normalizeScreen(s: Screen): Screen {
  return {
    id: s.id,
    label: s.label,
    source: s.source,
    x: s.x,
    y: s.y,
    w: s.w,
    h: s.h,
  };
}

/**
 * Produce a stable id "screen-N" not based on wall-clock. N is the smallest
 * positive integer such that "screen-N" is not already used.
 */
export function newScreenId(existing: Screen[]): string {
  const used = new Set(existing.map((s) => s.id));
  let n = 1;
  while (used.has(`screen-${n}`)) n += 1;
  return `screen-${n}`;
}
