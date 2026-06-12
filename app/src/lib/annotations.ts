// Design-feedback annotations (DEC-045). Figma-style comment pins + freehand pen
// marks drawn on the live preview, each carrying an instruction that becomes an
// agent fix request. This is the LIVE working store only (current pins + their
// status) — the durable record of what was asked lives in the agent chat + the
// activity thread (thread.json), per the history decision. Resolved pins are
// cleared from here.
//
// Coordinates are stored as FRACTIONS (0–1) of the preview box so they track on
// resize. Persisted to <root>/.continuum/issues/<id>/annotations.json (local,
// gitignored), so pins survive navigation / restart while in flight.

import { readFile, writeFile, readFileBytes } from "@/lib/ipc";
import { ulid } from "ulid";

/** Read a local PNG/screenshot into a data: URL (before/after display, DEC-046). */
export async function loadImageDataUrl(path: string): Promise<string | null> {
  try {
    const bytes = await readFileBytes(path);
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return `data:image/png;base64,${btoa(bin)}`;
  } catch {
    return null;
  }
}

export type AnnotationKind = "pin" | "pen" | "rect" | "element";

/**
 * draft   — placed, not yet sent to the agent (editable).
 * running — sent; the agent is working on this batch.
 * done    — the agent finished the batch that included this annotation.
 */
export type AnnotationStatus = "draft" | "running" | "done";

/** Element context from a cooperating preview's inspector (DEC-046 #3). */
export interface ElementContext {
  selector?: string;
  tag?: string;
  classes?: string;
  text?: string;
}

export interface Annotation {
  id: string;
  kind: AnnotationKind;
  /** Anchor point (fraction 0–1 of the preview box). Pen: centroid. Rect: top-left. */
  x: number;
  y: number;
  /** Freehand pen path as fractions (pen only). */
  path?: { x: number; y: number }[];
  /** Rectangle size as fractions (rect only; x,y is the top-left). */
  rect?: { w: number; h: number };
  /** Picked-element context from a cooperating preview (element only). */
  element?: ElementContext;
  /** The instruction text (what to change). */
  text: string;
  status: AnnotationStatus;
  /** ISO timestamp. */
  createdAt: string;
  /** Before (annotated, at send) / after (clean, on done) screenshots (DEC-046 #2). */
  beforeShot?: string;
  afterShot?: string;
}

function strip(p: string): string {
  return p.replace(/\/+$/, "");
}

function annotationsPath(root: string, issueId: string): string {
  return `${strip(root)}/.continuum/issues/${issueId}/annotations.json`;
}

/** The dir handed to the agent (`--add-dir`) holding the feedback screenshots. */
export function annotationsDir(root: string, issueId: string): string {
  return `${strip(root)}/.continuum/issues/${issueId}/feedback`;
}

/** A new annotation (draft) of any kind. */
export function newAnnotation(
  kind: AnnotationKind,
  x: number,
  y: number,
  opts?: {
    path?: { x: number; y: number }[];
    rect?: { w: number; h: number };
    element?: ElementContext;
  },
): Annotation {
  return {
    id: ulid(),
    kind,
    x,
    y,
    ...(opts?.path && opts.path.length ? { path: opts.path } : {}),
    ...(opts?.rect ? { rect: opts.rect } : {}),
    ...(opts?.element ? { element: opts.element } : {}),
    text: "",
    status: "draft",
    createdAt: new Date().toISOString(),
  };
}

function coerce(raw: unknown): Annotation[] {
  if (!Array.isArray(raw)) return [];
  const out: Annotation[] = [];
  for (const e of raw) {
    const kinds = ["pin", "pen", "rect", "element"];
    if (
      e &&
      typeof e.id === "string" &&
      kinds.includes(e.kind) &&
      typeof e.x === "number" &&
      typeof e.y === "number"
    ) {
      out.push({
        id: e.id,
        kind: e.kind,
        x: e.x,
        y: e.y,
        ...(Array.isArray(e.path) ? { path: e.path } : {}),
        ...(e.rect && typeof e.rect.w === "number" && typeof e.rect.h === "number"
          ? { rect: { w: e.rect.w, h: e.rect.h } }
          : {}),
        ...(e.element && typeof e.element === "object"
          ? { element: e.element as ElementContext }
          : {}),
        text: typeof e.text === "string" ? e.text : "",
        status:
          e.status === "running" || e.status === "done" ? e.status : "draft",
        createdAt: typeof e.createdAt === "string" ? e.createdAt : "",
        ...(typeof e.beforeShot === "string" ? { beforeShot: e.beforeShot } : {}),
        ...(typeof e.afterShot === "string" ? { afterShot: e.afterShot } : {}),
      });
    }
  }
  return out;
}

export async function readAnnotations(
  root: string,
  issueId: string,
): Promise<Annotation[]> {
  try {
    const text = await readFile(annotationsPath(root, issueId));
    return coerce(JSON.parse(text));
  } catch {
    return [];
  }
}

export async function writeAnnotations(
  root: string,
  issueId: string,
  list: Annotation[],
): Promise<void> {
  await writeFile(
    annotationsPath(root, issueId),
    `${JSON.stringify(list, null, 2)}\n`,
  );
}
