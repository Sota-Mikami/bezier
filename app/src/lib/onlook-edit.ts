// onlook-edit.ts — Onlook-style element-edit write-back for continuum v0.4.
//
// Pipeline (mirrors Onlook's @onlook/parser, scout findings #1/#2):
//   1. INSTRUMENT  source .tsx -> inject one opaque `data-oid` per JSX element
//      (addOidsToAst), and emit an oid -> {file,line,col,component} sidecar map
//      persisted at <repo>/.continuum/oid-index.json. The rendered DOM then
//      carries the same data-oid, so a clicked node maps back to a source node
//      by string-equal oid (no file:line:col ever lives in the DOM).
//   2. SELECT      the in-iframe bridge reports the clicked element's oid.
//   3. WRITE-BACK  resolve oid -> file via the sidecar map, parse the file,
//      transformAst(map oid -> {className}) editing the JSX `className` attr
//      (Tailwind-aware merge via tailwind-merge), regenerate with retainLines
//      (minimal diff), and writeFile through continuum's ipc layer.
//
// The content-level helpers (instrumentContent / applyEditToContent) are PURE
// and Node-safe (no DOM, no Tauri) so scripts/roundtrip.mjs can exercise them.
// The *File helpers use ipc.readFile/writeFile and only run inside Tauri.

import { readFile, writeFile } from "@/lib/ipc";
import type { StyleEdit } from "@/lib/preview-bridge";
import {
  addOidsToAst,
  getAstFromContent,
  getContentFromAst,
  getOidFromJsxElement,
  transformAst,
  type CodeDiffRequest,
} from "@/vendor/onlook";
import { t, traverse } from "@/vendor/onlook/packages";

/** A single instrumented element's source location + scope. */
export interface OidLocation {
  oid: string;
  tagName: string;
  line: number;
  column: number;
  /** nearest enclosing component/function/class name, or null at module scope. */
  component: string | null;
}

/** Persisted sidecar entry: where an oid lives in the repo. */
export interface OidIndexEntry {
  /** path relative to the repo root (POSIX separators). */
  file: string;
  line: number;
  column: number;
  tagName: string;
  component: string | null;
}

export interface OidIndex {
  schema: "1";
  /** oid -> location */
  entries: Record<string, OidIndexEntry>;
}

const OID_INDEX_REL = ".continuum/oid-index.json";

function oidIndexPath(repoPath: string): string {
  return `${repoPath}/${OID_INDEX_REL}`;
}

// ---------------------------------------------------------------------------
// PURE / Node-safe helpers
// ---------------------------------------------------------------------------

/** Extract the readable name from a JSX opening element (div, Button, a.b ...). */
function jsxTagName(node: import("@/vendor/onlook").T.JSXOpeningElement): string {
  const name = node.name;
  if (t.isJSXIdentifier(name)) return name.name;
  if (t.isJSXMemberExpression(name)) {
    const obj = t.isJSXIdentifier(name.object) ? name.object.name : "?";
    const prop = t.isJSXIdentifier(name.property) ? name.property.name : "?";
    return `${obj}.${prop}`;
  }
  if (t.isJSXNamespacedName(name)) {
    return `${name.namespace.name}:${name.name.name}`;
  }
  return "unknown";
}

/**
 * Walk an instrumented AST and collect oid -> location, tracking the nearest
 * enclosing component name via Function/Variable/Class declaration stacks
 * (mirrors Onlook's createTemplateNodeMap component scoping).
 */
function collectOidLocations(
  ast: import("@/vendor/onlook").T.File,
): OidLocation[] {
  const out: OidLocation[] = [];
  const componentStack: string[] = [];

  traverse(ast, {
    FunctionDeclaration: {
      enter(path) {
        if (path.node.id) componentStack.push(path.node.id.name);
      },
      exit(path) {
        if (path.node.id) componentStack.pop();
      },
    },
    ClassDeclaration: {
      enter(path) {
        if (path.node.id) componentStack.push(path.node.id.name);
      },
      exit(path) {
        if (path.node.id) componentStack.pop();
      },
    },
    VariableDeclaration: {
      enter(path) {
        const decl = path.node.declarations[0];
        if (decl && t.isIdentifier(decl.id)) {
          componentStack.push(decl.id.name);
        }
      },
      exit(path) {
        const decl = path.node.declarations[0];
        if (decl && t.isIdentifier(decl.id)) {
          componentStack.pop();
        }
      },
    },
    JSXOpeningElement(path) {
      const oid = getOidFromJsxElement(path.node);
      if (!oid) return;
      const loc = path.node.loc;
      out.push({
        oid,
        tagName: jsxTagName(path.node),
        line: loc?.start.line ?? 0,
        column: loc?.start.column ?? 0,
        component: componentStack[componentStack.length - 1] ?? null,
      });
    },
  });

  return out;
}

/**
 * Inject data-oid attributes into a React/TSX source string and return the new
 * code plus the per-element locations. PURE — no I/O. Returns the original
 * content unchanged (modified:false) if the source cannot be parsed.
 */
export function instrumentContent(
  content: string,
  globalOids?: Set<string>,
): { code: string; modified: boolean; oids: OidLocation[] } {
  const ast = getAstFromContent(content);
  if (!ast) {
    return { code: content, modified: false, oids: [] };
  }
  const { modified } = addOidsToAst(ast, globalOids ?? new Set<string>());
  const code = modified ? getContentFromAst(ast, content) : content;
  // Re-parse the *generated* code so reported line/cols match what was written.
  const finalAst = modified ? (getAstFromContent(code) ?? ast) : ast;
  const oids = collectOidLocations(finalAst);
  return { code, modified, oids };
}

/**
 * Apply a style/class edit to a single source string, keyed by oid. PURE.
 * Returns the original content unchanged if the source cannot be parsed or the
 * oid is not present.
 */
export function applyEditToContent(
  content: string,
  oid: string,
  edit: StyleEdit,
): { code: string; changed: boolean } {
  const ast = getAstFromContent(content);
  if (!ast) return { code: content, changed: false };

  const attributes: Record<string, string> = {};
  if (edit.className && edit.className.trim().length > 0) {
    attributes.className = edit.className.trim();
  }
  if (edit.props) {
    for (const [k, v] of Object.entries(edit.props)) attributes[k] = v;
  }
  if (Object.keys(attributes).length === 0) {
    return { code: content, changed: false };
  }

  const request: CodeDiffRequest = {
    attributes,
    overrideClasses: edit.override ?? false,
  };
  const map = new Map<string, CodeDiffRequest>([[oid, request]]);
  transformAst(ast, map);

  const code = getContentFromAst(ast, content);
  return { code, changed: code !== content };
}

// ---------------------------------------------------------------------------
// Sidecar oid-index (persisted under <repo>/.continuum/oid-index.json)
// ---------------------------------------------------------------------------

/** Load the oid -> location sidecar, or an empty index if missing/unreadable. */
export async function loadOidIndex(repoPath: string): Promise<OidIndex> {
  try {
    const raw = await readFile(oidIndexPath(repoPath));
    const parsed = JSON.parse(raw) as OidIndex;
    if (!parsed || parsed.schema !== "1" || typeof parsed.entries !== "object") {
      return { schema: "1", entries: {} };
    }
    return parsed;
  } catch {
    return { schema: "1", entries: {} };
  }
}

export async function saveOidIndex(
  repoPath: string,
  index: OidIndex,
): Promise<void> {
  const json = JSON.stringify(index, null, 2);
  await writeFile(oidIndexPath(repoPath), json + "\n");
}

/** repoPath + relative file -> absolute path (POSIX join). */
function joinRepo(repoPath: string, relFile: string): string {
  const r = repoPath.replace(/\/+$/, "");
  const f = relFile.replace(/^\/+/, "");
  return `${r}/${f}`;
}

/** absolute path -> repo-relative (POSIX). Falls back to the input if outside. */
function toRelative(repoPath: string, absFile: string): string {
  const r = repoPath.replace(/\/+$/, "") + "/";
  return absFile.startsWith(r) ? absFile.slice(r.length) : absFile;
}

// ---------------------------------------------------------------------------
// File-level pipeline (Tauri only — uses ipc.readFile/writeFile)
// ---------------------------------------------------------------------------

/**
 * Instrument one source file in-place: inject data-oid, write the file back if
 * it changed, and merge its oid locations into the repo sidecar index.
 * Returns the locations found for this file.
 */
export async function instrumentFile(
  repoPath: string,
  absFilePath: string,
): Promise<{ modified: boolean; oids: OidLocation[] }> {
  const content = await readFile(absFilePath);
  const { code, modified, oids } = instrumentContent(content);

  if (modified) {
    await writeFile(absFilePath, code);
  }

  // Merge into sidecar so oid -> file resolution works for write-back.
  const index = await loadOidIndex(repoPath);
  const rel = toRelative(repoPath, absFilePath);
  // Drop any stale entries that pointed at this file before re-adding.
  for (const [oid, entry] of Object.entries(index.entries)) {
    if (entry.file === rel) delete index.entries[oid];
  }
  for (const loc of oids) {
    index.entries[loc.oid] = {
      file: rel,
      line: loc.line,
      column: loc.column,
      tagName: loc.tagName,
      component: loc.component,
    };
  }
  await saveOidIndex(repoPath, index);

  return { modified, oids };
}

/**
 * Instrument many files (caller supplies the list of absolute .tsx/.jsx paths).
 * Uses a shared global oid set so oids stay unique across the whole repo.
 */
export async function instrumentFiles(
  repoPath: string,
  absFilePaths: string[],
): Promise<{ file: string; modified: boolean; count: number }[]> {
  const results: { file: string; modified: boolean; count: number }[] = [];
  const globalOids = new Set<string>();
  const index = await loadOidIndex(repoPath);

  for (const abs of absFilePaths) {
    const content = await readFile(abs);
    const { code, modified, oids } = instrumentContent(content, globalOids);
    for (const o of oids) globalOids.add(o.oid);
    if (modified) await writeFile(abs, code);

    const rel = toRelative(repoPath, abs);
    for (const [oid, entry] of Object.entries(index.entries)) {
      if (entry.file === rel) delete index.entries[oid];
    }
    for (const loc of oids) {
      index.entries[loc.oid] = {
        file: rel,
        line: loc.line,
        column: loc.column,
        tagName: loc.tagName,
        component: loc.component,
      };
    }
    results.push({ file: rel, modified, count: oids.length });
  }

  await saveOidIndex(repoPath, index);
  return results;
}

export class OidNotFoundError extends Error {
  constructor(public oid: string) {
    super(
      `oid "${oid}" not found in ${OID_INDEX_REL}. Run instrumentFiles() over the ` +
        `repo first so the preview DOM and the sidecar map share the same oids.`,
    );
    this.name = "OidNotFoundError";
  }
}

/**
 * Persist a style/class edit for `oid` back to its source file. Resolves the
 * file via the sidecar index, applies the AST transform, and writes via ipc.
 * Throws OidNotFoundError if the oid is unknown (repo not instrumented yet).
 */
export async function applyEdit(args: {
  repoPath: string;
  oid: string;
  edit: StyleEdit;
}): Promise<{ file: string; changed: boolean }> {
  const { repoPath, oid, edit } = args;
  const index = await loadOidIndex(repoPath);
  const entry = index.entries[oid];
  if (!entry) {
    throw new OidNotFoundError(oid);
  }

  const abs = joinRepo(repoPath, entry.file);
  const content = await readFile(abs);
  const { code, changed } = applyEditToContent(content, oid, edit);
  if (changed) {
    await writeFile(abs, code);
  }
  return { file: entry.file, changed };
}
