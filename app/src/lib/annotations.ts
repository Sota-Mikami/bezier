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

import { readFile, writeFile } from "@/lib/ipc";
import { ulid } from "ulid";

export type AnnotationKind = "pin" | "pen";

/**
 * draft   — placed, not yet sent to the agent (editable).
 * running — sent; the agent is working on this batch.
 * done    — the agent finished the batch that included this annotation.
 */
export type AnnotationStatus = "draft" | "running" | "done";

export interface Annotation {
  id: string;
  kind: AnnotationKind;
  /** Anchor point (fraction 0–1 of the preview box). For a pen, the centroid. */
  x: number;
  y: number;
  /** Freehand pen path as fractions (absent/empty for a pin). */
  path?: { x: number; y: number }[];
  /** The instruction text (what to change). */
  text: string;
  status: AnnotationStatus;
  /** ISO timestamp. */
  createdAt: string;
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

/** A new pin/pen annotation (draft). */
export function newAnnotation(
  kind: AnnotationKind,
  x: number,
  y: number,
  path?: { x: number; y: number }[],
): Annotation {
  return {
    id: ulid(),
    kind,
    x,
    y,
    ...(path && path.length ? { path } : {}),
    text: "",
    status: "draft",
    createdAt: new Date().toISOString(),
  };
}

function coerce(raw: unknown): Annotation[] {
  if (!Array.isArray(raw)) return [];
  const out: Annotation[] = [];
  for (const e of raw) {
    if (
      e &&
      typeof e.id === "string" &&
      (e.kind === "pin" || e.kind === "pen") &&
      typeof e.x === "number" &&
      typeof e.y === "number"
    ) {
      out.push({
        id: e.id,
        kind: e.kind,
        x: e.x,
        y: e.y,
        ...(Array.isArray(e.path) ? { path: e.path } : {}),
        text: typeof e.text === "string" ? e.text : "",
        status:
          e.status === "running" || e.status === "done" ? e.status : "draft",
        createdAt: typeof e.createdAt === "string" ? e.createdAt : "",
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
