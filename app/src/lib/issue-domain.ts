// Issue domain primitives — pure (no IPC / fs / React). The one exception is
// documentLabel(), which reads the UI locale via the safe non-React tt() snapshot
// (DEC-108) so doc labels follow the language; everything else stays dependency-free.
// Extracted from issues.ts so the issue state machine and naming rules can be
// unit-tested in isolation and reused without pulling in the data layer.
// Re-exported from issues.ts, so `@/lib/issues` consumers are unaffected.

import { tt } from "@/lib/i18n";

// Persisted lifecycle marker, auto-maintained (no manual editing, DEC-027):
// open (no work) → in-progress (worktree exists) → merged (landed on main). The
// user-facing state is DERIVED from this + live facts (see deriveState).
export type IssueStatus = "open" | "in-progress" | "merged";

export const ISSUE_STATUSES: IssueStatus[] = ["open", "in-progress", "merged"];

/**
 * The DERIVED, user-facing state (DEC-027). Computed from facts — never set by
 * hand — so it can't drift: a running agent, an open PR, a merge all show
 * through automatically.
 */
export type DerivedState = "idea" | "running" | "draft" | "review" | "done";

/** Derive the user-facing state from the persisted status + live facts. */
export function deriveState(opts: {
  status: IssueStatus;
  /** A background agent (pty) is currently running for this issue. */
  running: boolean;
  /** A PR has been opened (worktree ref has a prUrl). */
  hasPr: boolean;
  /** A worktree exists (work has started) — defaults from status when unknown. */
  hasWorktree?: boolean;
}): DerivedState {
  if (opts.status === "merged") return "done";
  if (opts.running) return "running";
  if (opts.hasPr) return "review";
  const started = opts.hasWorktree ?? opts.status === "in-progress";
  return started ? "draft" : "idea";
}

// (DERIVED_STATE_META — the JA state-badge labels — was removed with the state
// badges in DEC-105; deriveState() remains for any future state-aware UI.)

// DEC-011: the Design slot is removed (design intent lives in the Spec; the
// output is the PR/code diff itself). DEC-014/A: decision.md is removed too —
// the durable "why" now lives in the issue's spec + the thread.json activity log
// (the accept event records the committed paths + branch) + the PR body. Spec is
// the only artifact slot.
export type IssueSlot = "spec";

export interface IssueSlots {
  spec: boolean;
}

/** kebab-case ASCII slug; "" when nothing survives (so untitled issues get no
 * "-untitled" noise in their folder/branch — just the ULID, DEC-091). */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The on-disk / branch identifier for an issue: the ULID, plus `-<slug>` ONLY
 * when there's a real slug (a title was given at creation). Untitled issues are
 * just the ULID — no "-untitled" (DEC-091). Back-compatible: an existing issue
 * carries slug "untitled" (parsed from its old folder), so it keeps its name. */
export function issueFolderName(id: string, slug: string): string {
  return slug ? `${id}-${slug}` : id;
}

/** True when a title is the empty/placeholder default (no real title yet). */
export function isUntitled(title: string | null | undefined): boolean {
  const t = (title ?? "").trim();
  return !t || t.toLowerCase() === "untitled";
}

/**
 * Derive a title from a spec.md body: the first `# ` heading, unless it's still
 * the template placeholder ("Untitled"). Returns null when there's no real title
 * to use yet. (DEC-057: derive from facts — the spec the agent actually wrote —
 * instead of waiting on the frontmatter being set perfectly.)
 */
export function titleFromSpec(specText: string): string | null {
  for (const line of specText.split("\n")) {
    const m = /^#\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    const h = m[1].replace(/\{\{\s*title\s*\}\}/g, "").trim();
    return isUntitled(h) ? null : h;
  }
  return null;
}

// --- Documents (Document View) ---------------------------------------------
// Per-issue documents are keyed by their filename stem (spec/qa/decision/…).
// Known stems get a display label + sort rank; anything else (agent/convention-
// created docs) is humanized and sorted after, so the view reflects whatever
// the repo's conventions produced without a fixed schema.

// Known stems → a docType catalog key (the label follows the UI locale, DEC-108).
const DOC_LABEL_KEYS: Record<string, "spec" | "decision" | "qa" | "handoff"> = {
  spec: "spec",
  decision: "decision",
  decisions: "decision",
  qa: "qa",
  handoff: "handoff",
  share: "handoff",
};

const DOC_ORDER = ["spec", "decision", "decisions", "qa", "handoff", "share"];

/** Display label for a document, keyed by its filename stem ("qa" → "QA").
 * Known stems use the locale catalog; unknown stems are humanized
 * ("design-notes" → "Design Notes"). */
export function documentLabel(stem: string): string {
  const key = DOC_LABEL_KEYS[stem.toLowerCase()];
  if (key) return tt(`docType.${key}`);
  return stem
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Sort rank: known types in DOC_ORDER first (spec leads), ad-hoc docs after. */
export function documentRank(stem: string): number {
  const i = DOC_ORDER.indexOf(stem.toLowerCase());
  return i < 0 ? 100 : i;
}
