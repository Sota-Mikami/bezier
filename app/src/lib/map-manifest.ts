// Agentic Map — Capture Manifest (ISSUE-006, Phase 1).
//
// The manifest is the agent's design-time declaration of WHAT to capture and
// HOW to reach each screen+state combo. Bezier writes nothing here; the agent
// produces it via /bezier:map, Bezier reads + validates it, then executes
// only the url-reachable entries via the existing authed-webview pipeline
// (DEC-133). All other reach kinds render as gap cells.
//
// Security notes
// - All paths are under <issue.dir>/.bezier (capture_region enforces this).
// - manifest.json is read/written via the normal IPC readFile/writeFile.
// - Manifest content is agent-produced and UNTRUSTED: we validate with Zod
//   before touching any entry, and we re-derive IDs (never trust agent's id).
//
// This file has NO React / component imports — pure data + IPC.

import { z } from "zod";
import { readFile, writeFile } from "@/lib/ipc";
import { type Issue } from "@/lib/issues";
import { routeSlug } from "@/lib/scope";

// ---------------------------------------------------------------------------
// Step DSL (Phase 2 executor will parse this; define vocab now so existing
// manifests don't need re-generation). Allowed verbs:
//   click:<css-selector>
//   fill:<selector>:<value>
//   navigate:<path>
//   wait:<css-selector>
//   wait-ms:<n>
// ---------------------------------------------------------------------------
const STEP_RE = /^(click|fill|navigate|wait|wait-ms):/;

// ---------------------------------------------------------------------------
// Zod schemas — strict validation; bad agent output fails loudly.
// ---------------------------------------------------------------------------

const ReachSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("url"), url: z.string().min(1) }),
  z.object({
    kind: z.literal("seed"),
    command: z.string().min(1),
    url: z.string().min(1),
  }),
  z.object({
    kind: z.literal("steps"),
    url: z.string().min(1),
    steps: z
      .array(z.string().refine((s) => STEP_RE.test(s), { message: "step must match <verb>:<args>" }))
      .min(1),
  }),
  z.object({ kind: z.literal("harness"), note: z.string(), url: z.string().min(1) }),
  z.object({ kind: z.literal("manual"), note: z.string() }),
]);

const ManifestEntrySchema = z.object({
  /** Canonical stable id: derived by Bezier, not the agent. */
  id: z.string().min(1),
  /** Human-readable label. */
  label: z.string(),
  /** URL path (must start with /). */
  route: z.string().regex(/^\//),
  /** State label in lowercase-kebab-case. */
  state: z.string().min(1),
  /** Why this entry exists. */
  source: z.enum(["diff", "spec", "diff+spec"]),
  reach: ReachSchema,
  /** Agent's confidence in this entry's accuracy. */
  confidence: z.enum(["high", "medium", "low"]).optional(),
  /** spec.md reference that defines this state (e.g. "spec.md:42" or "AC-3"). */
  specRef: z.string().optional(),
  /** Changed file path that makes this route relevant. */
  diffRef: z.string().optional(),
});

const CaptureManifestSchema = z.object({
  version: z.literal(1),
  /** ISO 8601 timestamp of generation. */
  generatedAt: z.string(),
  /** Git branch the diff was computed against. */
  baseBranch: z.string(),
  /** false = agent parsed prose (no bezier:states block) — less reliable. */
  specStatesBlock: z.boolean().optional(),
  /** "static" = Next.js file-path inference; "agent" = agent-led fallback. */
  routeInferenceMethod: z.enum(["static", "agent"]).optional(),
  entries: z.array(ManifestEntrySchema),
});

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type Reach = z.infer<typeof ReachSchema>;
export type ManifestEntry = z.infer<typeof ManifestEntrySchema>;
export type CaptureManifest = z.infer<typeof CaptureManifestSchema>;

/** Reason a cell has no screenshot (transient — not persisted). */
export interface GapReason {
  kind: "redirected" | "capture-error" | "not-captured";
  detail?: string; // e.g. "redirected to /auth/login"
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/** Where the manifest lives under `.bezier` (gitignored). */
export function manifestPath(issue: Pick<Issue, "dir">): string {
  return `${issue.dir}/map/manifest.json`;
}

/**
 * Stable, Bezier-canonical ID for a manifest entry.
 * Always derived from (route, state) here — never trusted from agent output.
 * Examples:
 *   "/dashboard" + "Empty State"  → "dashboard--empty-state"
 *   "/dashboard" + "error"        → "dashboard--error"
 *   "/"          + "default"      → "root--default"
 */
export function manifestEntryId(route: string, state: string): string {
  const r = routeSlug(route); // "/dashboard" → "dashboard"
  const s =
    state
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "default";
  return `${r}--${s}`;
}

/** Where a manifest entry's captured still lives (under `.bezier`). */
export function manifestStillPath(
  issue: Pick<Issue, "dir">,
  entryId: string,
): string {
  return `${issue.dir}/map/${entryId}.png`;
}

// ---------------------------------------------------------------------------
// Filtering helpers
// ---------------------------------------------------------------------------

/** Entries Bezier can auto-capture in Phase 1 (reach.kind === "url"). */
export function urlEntries(manifest: CaptureManifest): ManifestEntry[] {
  return manifest.entries.filter((e) => e.reach.kind === "url");
}

/** All distinct routes in manifest order (deduplicated). */
export function manifestRoutes(manifest: CaptureManifest): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of manifest.entries) {
    if (!seen.has(e.route)) { seen.add(e.route); out.push(e.route); }
  }
  return out;
}

/** All distinct states in manifest order (deduplicated); "default" is always first. */
export function manifestStates(manifest: CaptureManifest): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  if (manifest.entries.some((e) => e.state === "default")) {
    seen.add("default");
    out.push("default");
  }
  for (const e of manifest.entries) {
    if (!seen.has(e.state)) { seen.add(e.state); out.push(e.state); }
  }
  return out;
}

/** Lookup: (route, state) → ManifestEntry | undefined */
export function manifestCell(
  manifest: CaptureManifest,
  route: string,
  state: string,
): ManifestEntry | undefined {
  const id = manifestEntryId(route, state);
  return manifest.entries.find((e) => e.id === id);
}

// ---------------------------------------------------------------------------
// Read / write
// ---------------------------------------------------------------------------

/**
 * Parse raw manifest JSON, throw a structured error message on failure.
 * Also re-derives all entry IDs (discard agent's id — Bezier owns IDs).
 */
function parseManifest(raw: string): CaptureManifest {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `Manifest JSON parse error: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const result = CaptureManifestSchema.safeParse(json);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 6)
      .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Manifest validation failed:\n${issues}`);
  }
  // Normalize all IDs — the agent's `id` field is advisory, Bezier re-derives.
  const manifest = result.data;
  manifest.entries = manifest.entries.map((e) => ({
    ...e,
    id: manifestEntryId(e.route, e.state),
  }));
  return manifest;
}

/**
 * Load the manifest for an issue.
 * Returns `null` when absent (not generated yet).
 * Throws a human-readable string when present but invalid.
 */
export async function readManifest(
  issue: Pick<Issue, "dir">,
): Promise<CaptureManifest | null> {
  let raw: string;
  try {
    raw = await readFile(manifestPath(issue));
  } catch {
    return null; // file not yet generated — not an error
  }
  return parseManifest(raw); // invalid JSON/schema → throws (surfaced in UI)
}

/** Persist the manifest (always under `.bezier` — gitignored). */
export async function writeManifest(
  issue: Pick<Issue, "dir">,
  manifest: CaptureManifest,
): Promise<void> {
  await writeFile(
    manifestPath(issue),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}
