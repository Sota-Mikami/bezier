// Issue domain primitives — pure, dependency-free (no IPC / fs / settings / React).
// Extracted from issues.ts so the issue state machine and naming rules can be
// unit-tested in isolation and reused without pulling in the data layer.
// Re-exported from issues.ts, so `@/lib/issues` consumers are unaffected.

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

/** JA label + a tone token for each derived state (UI badge / sidebar). */
export const DERIVED_STATE_META: Record<
  DerivedState,
  { label: string; tone: "muted" | "running" | "draft" | "review" | "done" }
> = {
  idea: { label: "未着手", tone: "muted" },
  running: { label: "実行中", tone: "running" },
  draft: { label: "下書き", tone: "draft" },
  review: { label: "レビュー中", tone: "review" },
  done: { label: "完了", tone: "done" },
};

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

// --- Documents (Document View) ---------------------------------------------
// Per-issue documents are keyed by their filename stem (spec/qa/decision/…).
// Known stems get a display label + sort rank; anything else (agent/convention-
// created docs) is humanized and sorted after, so the view reflects whatever
// the repo's conventions produced without a fixed schema.

const DOC_LABELS: Record<string, string> = {
  spec: "Spec",
  decision: "決定",
  decisions: "決定",
  qa: "QA",
  handoff: "共有",
  share: "共有",
};

const DOC_ORDER = ["spec", "decision", "decisions", "qa", "handoff", "share"];

/** Display label for a document, keyed by its filename stem ("qa" → "QA").
 * Unknown stems are humanized ("design-notes" → "Design Notes"). */
export function documentLabel(stem: string): string {
  const known = DOC_LABELS[stem.toLowerCase()];
  if (known) return known;
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
