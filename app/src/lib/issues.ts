// Issues data layer (v0.5 slice 1 — pre-git, local).
//
// Every issue is a folder under <root>/.bezier/drafts/<ulid>-<slug>/ (the
// .bezier tree is gitignored). issue.md holds the metadata (frontmatter) +
// description (body); the spec / decision "slots" are convention-path
// files that exist only once created ("presence-driven", §3.5 / P5).
//
// Reuse only: ipc (listDir/readFile/writeFile — writeFile auto-creates parent
// dirs) and markdown.splitFrontmatter (byte-preserving split). Frontmatter is
// parsed/emitted via the `yaml` package directly so fields beyond the typed
// Frontmatter shape (id / labels / screens) survive round-trips.

import {
  listDir,
  readFile,
  writeFile,
  removePath,
  movePath,
  appDataDir,
} from "@/lib/ipc";
import { splitFrontmatter } from "@/lib/markdown";
import { getSettings } from "@/lib/settings";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import { ulid } from "ulid";

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

export interface Issue {
  /** ULID (canonical id). Also the prefix of the folder name. */
  id: string;
  /** kebab slug derived from the title at creation ("untitled" fallback). */
  slug: string;
  /** Absolute path to the issue folder. */
  dir: string;
  title: string;
  status: IssueStatus;
  screens?: string[];
  labels?: string[];
  /** ISO timestamp string. */
  created: string;
  /** issue.md description body (everything after the frontmatter). */
  body: string;
  slots: IssueSlots;
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/** <root>/.bezier/drafts — the local working store for issues (slice 1). */
export function draftsDir(root: string): string {
  return `${stripTrailingSlash(root)}/.bezier/drafts`;
}

/** Absolute path to a slot file for an issue. */
export function slotPath(issue: Pick<Issue, "dir">, slot: IssueSlot): string {
  switch (slot) {
    case "spec":
      return `${issue.dir}/spec.md`;
  }
}

function stripTrailingSlash(p: string): string {
  return p.replace(/\/+$/, "");
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

// ---------------------------------------------------------------------------
// Frontmatter (parse via yaml; emit via yaml — preserves id/labels/screens)
// ---------------------------------------------------------------------------

function parseFm(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  // raw is the verbatim `---\n…\n---\n` block (optionally BOM-prefixed).
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (!m) return {};
  try {
    const data = yamlParse(m[1]) as unknown;
    return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : v instanceof Date ? toDateString(v) : undefined;
}

function asStringArray(v: unknown): string[] | undefined {
  if (Array.isArray(v)) {
    const arr = v.filter((x): x is string => typeof x === "string");
    return arr.length ? arr : undefined;
  }
  return undefined;
}

function toDateString(d: Date): string {
  return d.toISOString();
}

interface IssueMeta {
  id: string;
  title: string;
  status: IssueStatus;
  labels?: string[];
  screens?: string[];
  created: string;
}

/** Emit a `---\n…\n---\n` frontmatter block for issue.md (stable field order). */
function serializeIssueFm(meta: IssueMeta): string {
  const data: Record<string, unknown> = {
    id: meta.id,
    title: meta.title,
    status: meta.status,
  };
  if (meta.labels && meta.labels.length) data.labels = meta.labels;
  if (meta.screens && meta.screens.length) data.screens = meta.screens;
  data.created = meta.created;
  // yamlStringify ends with a trailing newline -> `---\n<yaml>---\n`.
  return `---\n${yamlStringify(data)}---\n`;
}

function coerceStatus(v: unknown): IssueStatus {
  return v === "in-progress" || v === "merged" ? v : "open";
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** Split a draft folder name `<ulid>-<slug>` into its id + slug parts. */
function splitFolderName(name: string): { id: string; slug: string } {
  const dash = name.indexOf("-");
  if (dash < 0) return { id: name, slug: "" };
  return { id: name.slice(0, dash), slug: name.slice(dash + 1) };
}

async function readIssueAt(
  dir: string,
  id: string,
  slug: string,
): Promise<Issue | null> {
  let text: string;
  try {
    text = await readFile(`${dir}/issue.md`);
  } catch {
    return null; // folder without an issue.md is not an issue
  }
  const { rawFrontmatter, body } = splitFrontmatter(text);
  const fm = parseFm(rawFrontmatter);

  // Slot presence: scan the folder once.
  let names: Set<string>;
  try {
    const entries = await listDir(dir);
    names = new Set(entries.map((e) => e.name));
  } catch {
    names = new Set();
  }

  return {
    id: asString(fm.id) ?? id,
    slug,
    dir,
    title: asString(fm.title) ?? (slug || id),
    status: coerceStatus(fm.status),
    labels: asStringArray(fm.labels),
    screens: asStringArray(fm.screens),
    created: asString(fm.created) ?? "",
    body,
    slots: {
      spec: names.has("spec.md"),
    },
  };
}

/** List all issues under .bezier/drafts, newest first (ULID is time-sortable). */
export async function listIssues(root: string): Promise<Issue[]> {
  const base = draftsDir(root);
  let entries;
  try {
    entries = await listDir(base);
  } catch {
    return []; // no drafts dir yet
  }
  const issues: Issue[] = [];
  for (const e of entries) {
    if (!e.isDir) continue;
    const { id, slug } = splitFolderName(e.name);
    const issue = await readIssueAt(e.path, id, slug);
    if (issue) issues.push(issue);
  }
  // id (ULID) desc == created desc.
  issues.sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  return issues;
}

/** Read a single issue by id (scans drafts for the matching folder). */
export async function readIssue(root: string, id: string): Promise<Issue | null> {
  const base = draftsDir(root);
  let entries;
  try {
    entries = await listDir(base);
  } catch {
    return null;
  }
  const match = entries.find(
    (e) => e.isDir && splitFolderName(e.name).id === id,
  );
  if (!match) return null;
  return readIssueAt(match.path, id, splitFolderName(match.name).slug);
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/** Create a new draft issue. Returns the created Issue. */
export async function createIssue(root: string, title: string): Promise<Issue> {
  const id = ulid();
  const cleanTitle = title.trim();
  const slug = slugify(cleanTitle);
  const dir = `${draftsDir(root)}/${issueFolderName(id, slug)}`;
  const created = new Date().toISOString();
  const fm = serializeIssueFm({ id, title: cleanTitle || "Untitled", status: "open", created });
  const heading = cleanTitle ? `# ${cleanTitle}\n\n` : "";
  const body = `${heading}> 解きたい問題 / 機会をここに書く。\n`;
  const issue: Issue = {
    id,
    slug,
    dir,
    title: cleanTitle || "Untitled",
    status: "open",
    created,
    body,
    // Spec is the one mandatory slot (DEC-011/016). Create it up front so the
    // maker never has to click "Add Spec" before writing the spec.
    slots: { spec: true },
  };
  await writeFile(`${dir}/issue.md`, `${fm}${body}`);
  await writeFile(slotPath(issue, "spec"), SLOT_TEMPLATES.spec(issue));
  return issue;
}

/**
 * Move an issue's draft folder to another repo (DEC-084). Only safe BEFORE work
 * starts (no worktree / no agent run): at that point the only on-disk state is
 * the `drafts/<id>-<slug>/` folder, so a plain folder move re-homes it cleanly.
 * After work starts, per-repo state (thread.json, agent-events, the worktree) is
 * tied to the old repo, so the caller must lock this. Returns the issue with its
 * new `dir`.
 */
export async function moveIssueToRepo(issue: Issue, toRoot: string): Promise<Issue> {
  const dest = `${draftsDir(toRoot)}/${issueFolderName(issue.id, issue.slug)}`;
  if (dest === issue.dir) return issue;
  await movePath(issue.dir, dest);
  return { ...issue, dir: dest };
}

/** Update issue.md metadata (title/status/labels), preserving id/created/screens + body. */
export async function updateIssueMeta(
  root: string,
  issue: Pick<Issue, "id" | "dir" | "title" | "status" | "created">,
  patch: { title?: string; status?: IssueStatus; labels?: string[] },
): Promise<void> {
  const path = `${issue.dir}/issue.md`;
  const text = await readFile(path);
  const { rawFrontmatter, body } = splitFrontmatter(text);
  const cur = parseFm(rawFrontmatter);
  const meta: IssueMeta = {
    id: asString(cur.id) ?? issue.id,
    title: patch.title ?? asString(cur.title) ?? issue.title,
    status: patch.status ?? coerceStatus(cur.status),
    labels: patch.labels ?? asStringArray(cur.labels),
    screens: asStringArray(cur.screens),
    created: asString(cur.created) ?? issue.created,
  };
  await writeFile(path, `${serializeIssueFm(meta)}${body}`);
}

/** <root>/.bezier — the local working store root (drafts + issues + trash). */
function bezierDir(root: string): string {
  return `${stripTrailingSlash(root)}/.bezier`;
}

// ---------------------------------------------------------------------------
// Trash (recoverable delete + 30-day auto-purge, DEC-020)
// ---------------------------------------------------------------------------
//
// Deleting an issue MOVES it to .bezier/trash/ instead of erasing it — git
// (worktree + branch) is left untouched, so a trashed issue is fully restorable.
// Only an explicit "完全に削除" or the 30-day auto-purge does the destructive
// teardown. Layout mirrors the live store:
//   .bezier/trash/drafts/<id>-<slug>/   (incl. .trashed.json marker)
//   .bezier/trash/issues/<id>/          (the activity thread, if any)

/** Default days a trashed issue is kept (the settings default; DEC-020). The
 * effective value is user-configurable — read `trashTtlDays()` for the live one. */
export const TRASH_TTL_DAYS = 30;

/** Effective trash TTL in days (settings override, falls back to the default). */
export function trashTtlDays(): number {
  return getSettings().trashTtlDays;
}

/** Deletion marker written inside a trashed issue's folder (.trashed.json). */
export interface TrashMeta {
  id: string;
  slug: string;
  title: string;
  /** ISO timestamp of when it was moved to the trash. */
  deletedAt: string;
  /** The issue's branch + worktree, if it had one (for purge-time teardown). */
  branch?: string;
  worktreePath?: string;
  /** The opened PR's URL, if any (shown in the trash preview). */
  prUrl?: string;
}

function trashDraftsDir(root: string): string {
  return `${bezierDir(root)}/trash/drafts`;
}
function trashIssuesDir(root: string): string {
  return `${bezierDir(root)}/trash/issues`;
}

/**
 * Move an issue to the trash (the default "delete"). Records a .trashed.json
 * marker (incl. branch/worktree for later teardown), then moves the issue folder
 * and its thread dir under .bezier/trash/. git is NOT touched — restore is a
 * pure move-back. The worktree ref is read for the marker but left intact.
 */
export async function trashIssue(root: string, issue: Issue): Promise<void> {
  const ref = await readWorktreeRef(issue).catch(() => null);
  const folderName = issueFolderName(issue.id, issue.slug);
  const meta: TrashMeta = {
    id: issue.id,
    slug: issue.slug,
    title: issue.title,
    deletedAt: new Date().toISOString(),
    ...(ref ? { branch: ref.branch, worktreePath: ref.path } : {}),
    ...(ref?.prUrl ? { prUrl: ref.prUrl } : {}),
  };
  // Marker is written into the live folder BEFORE the move, so it travels with it.
  await writeFile(`${issue.dir}/.trashed.json`, `${JSON.stringify(meta, null, 2)}\n`);
  await movePath(issue.dir, `${trashDraftsDir(root)}/${folderName}`);
  // Thread dir (may not exist) — best-effort.
  await movePath(
    `${bezierDir(root)}/issues/${issue.id}`,
    `${trashIssuesDir(root)}/${issue.id}`,
  ).catch(() => {});
}

/** List trashed issues, newest-deleted first. Reads each .trashed.json marker. */
export async function listTrash(root: string): Promise<TrashMeta[]> {
  let entries;
  try {
    entries = await listDir(trashDraftsDir(root));
  } catch {
    return [];
  }
  const out: TrashMeta[] = [];
  for (const e of entries) {
    if (!e.isDir) continue;
    try {
      const raw = await readFile(`${e.path}/.trashed.json`);
      const m = JSON.parse(raw) as TrashMeta;
      if (m && typeof m.id === "string" && typeof m.deletedAt === "string") {
        out.push(m);
      }
    } catch {
      /* missing/corrupt marker — skip */
    }
  }
  out.sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : a.deletedAt > b.deletedAt ? -1 : 0));
  return out;
}

/** A read-only snapshot of a trashed issue (for the trash preview — no worktree). */
export interface TrashDetail {
  meta: TrashMeta;
  /** issue.md description body (frontmatter stripped). */
  body: string;
  /** spec.md content, or null if it had none. */
  spec: string | null;
  /** The durable activity thread, if any. */
  thread: ThreadEvent[];
}

/**
 * Read a trashed issue's contents WITHOUT restoring it (no worktree, no git):
 * its issue.md body, spec.md, and activity thread, straight from the trash
 * store. `id` is the issue id; the folder is found by scanning the trash.
 */
export async function readTrashDetail(
  root: string,
  id: string,
): Promise<TrashDetail | null> {
  let entries;
  try {
    entries = await listDir(trashDraftsDir(root));
  } catch {
    return null;
  }
  const match = entries.find(
    (e) => e.isDir && splitFolderName(e.name).id === id,
  );
  if (!match) return null;

  let meta: TrashMeta;
  try {
    meta = JSON.parse(await readFile(`${match.path}/.trashed.json`)) as TrashMeta;
  } catch {
    return null;
  }

  let body = "";
  try {
    const text = await readFile(`${match.path}/issue.md`);
    body = splitFrontmatter(text).body.trim();
  } catch {
    /* no issue.md */
  }

  let spec: string | null = null;
  try {
    spec = await readFile(`${match.path}/spec.md`);
  } catch {
    /* no spec.md */
  }

  let thread: ThreadEvent[] = [];
  try {
    const raw = await readFile(`${trashIssuesDir(root)}/${id}/thread.json`);
    const data = JSON.parse(raw) as unknown;
    if (Array.isArray(data)) {
      thread = data.filter(
        (e): e is ThreadEvent =>
          !!e &&
          typeof (e as ThreadEvent).type === "string" &&
          typeof (e as ThreadEvent).at === "string",
      );
    }
  } catch {
    /* no thread */
  }

  return { meta, body, spec, thread };
}

/** Restore a trashed issue back into the live store (move-back). */
export async function restoreFromTrash(root: string, meta: TrashMeta): Promise<void> {
  const folderName = issueFolderName(meta.id, meta.slug);
  const draft = `${draftsDir(root)}/${folderName}`;
  await movePath(`${trashDraftsDir(root)}/${folderName}`, draft);
  await removePath(`${draft}/.trashed.json`).catch(() => {});
  await movePath(
    `${trashIssuesDir(root)}/${meta.id}`,
    `${bezierDir(root)}/issues/${meta.id}`,
  ).catch(() => {});
}

/**
 * Permanently remove a trashed issue's folders (.bezier/trash/...). Does NOT
 * tear down git — the caller purges the worktree/branch (it has meta.branch /
 * meta.worktreePath) before/after calling this, like purgeIssue does.
 */
export async function removeTrashEntry(root: string, meta: TrashMeta): Promise<void> {
  await removePath(`${trashDraftsDir(root)}/${issueFolderName(meta.id, meta.slug)}`);
  await removePath(`${trashIssuesDir(root)}/${meta.id}`);
}

/** Trashed entries past the TTL (candidates for the auto-purge on load). */
export function expiredTrash(trash: TrashMeta[], now: number): TrashMeta[] {
  const ttlMs = trashTtlDays() * 24 * 60 * 60 * 1000;
  return trash.filter((m) => {
    const t = Date.parse(m.deletedAt);
    return Number.isFinite(t) && now - t >= ttlMs;
  });
}

/** Substitute `{{id}}` / `{{title}}` in a Spec template (DEC-043, settings). */
function renderTemplate(tmpl: string, issue: Pick<Issue, "id" | "title">): string {
  return tmpl
    .split("{{id}}").join(issue.id)
    .split("{{title}}").join(issue.title || "Untitled");
}

// Spec is the only hand-created slot (DEC-011 / DEC-014/A). The template is
// user-customizable in Settings (DEC-043); getSettings() returns the live value
// (falling back to DEFAULT_SPEC_TEMPLATE).
const SLOT_TEMPLATES: Record<IssueSlot, (issue: Issue) => string> = {
  spec: (issue) => renderTemplate(getSettings().specTemplate, issue),
};

/**
 * Create a slot file with its template if it does not already exist.
 * Returns the slot file's absolute path. No-op (returns path) when present.
 */
export async function createSlot(
  root: string,
  issue: Issue,
  slot: IssueSlot,
): Promise<string> {
  const path = slotPath(issue, slot);
  try {
    await readFile(path);
    return path; // already exists — leave it untouched
  } catch {
    // not found -> create from template
  }
  await writeFile(path, SLOT_TEMPLATES[slot](issue));
  return path;
}

// ---------------------------------------------------------------------------
// v0.5 slice 2 — implementation loop (branch / worktree / handoff / decision)
// ---------------------------------------------------------------------------

/**
 * Volatile reference to an Issue's git worktree. Persisted as JSON beside the
 * issue (issue.dir/worktree.json) — gitignored, like the rest of .bezier.
 */
export interface WorktreeRef {
  /** branch name (issue/<ulid>-<slug>). */
  branch: string;
  /**
   * Absolute worktree path. Since slice 2.5.1 this lives OUTSIDE the repo, under
   * <appData>/worktrees/<repo-id>/<ulid> (see worktreeDir). Older refs may point
   * inside the repo (<root>/.bezier/worktrees/<ulid>); both are honored on
   * resume — the stored path is the source of truth for diff/commit/remove.
   */
  path: string;
  /** SHA the branch was created off (best-effort; may be empty). */
  baseSHA: string;
  /**
   * URL of the GitHub PR opened for this branch (DEC-015 Open-PR finalize).
   * Persisted so re-opening the issue still surfaces the PR link. Absent until
   * a PR has been opened.
   */
  prUrl?: string;
}

/** branch name convention (DEC-047 G2 / DEC-091): `issue/<ulid>[-<slug>]` — just
 * the ULID for untitled issues (no "-untitled"). */
export function branchName(issue: Pick<Issue, "id" | "slug">): string {
  return `issue/${issueFolderName(issue.id, issue.slug)}`;
}

/**
 * Short, stable, filesystem-safe id for a repo, derived from its absolute path.
 * `<basename>-<8-hex hash>` keeps worktree dirs human-readable while avoiding
 * collisions between same-named repos in different locations.
 */
function repoId(repoRoot: string): string {
  const root = stripTrailingSlash(repoRoot);
  const base =
    (root.split("/").pop() || "repo").replace(/[^A-Za-z0-9._-]/g, "_") || "repo";
  // FNV-1a 32-bit over the full path — deterministic, no crypto needed.
  let h = 0x811c9dc5;
  for (let i = 0; i < root.length; i++) {
    h ^= root.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${base}-${(h >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * Absolute worktree path for an issue, OUTSIDE the repo:
 * <appData>/worktrees/<repo-id>/<ulid>.
 *
 * A worktree nested inside the repo (the old <root>/.bezier/worktrees/...)
 * breaks workspace-root inference: Next.js/Turbopack and package managers walk
 * UP and find the PARENT repo's lockfile/node_modules, then refuse to compile
 * the nested copy ("files outside of the project directory will not be
 * compiled"). Hosting the worktree externally gives it a single, unambiguous
 * root (its own lockfile + the symlinked node_modules from the main repo).
 */
export async function worktreeDir(
  repoRoot: string,
  issue: Pick<Issue, "id">,
): Promise<string> {
  const base = stripTrailingSlash(await appDataDir());
  return `${base}/worktrees/${repoId(repoRoot)}/${issue.id}`;
}

function worktreeRefPath(issue: Pick<Issue, "dir">): string {
  return `${issue.dir}/worktree.json`;
}

/** Read the issue's worktree ref, or null if none / unreadable. */
export async function readWorktreeRef(
  issue: Pick<Issue, "dir">,
): Promise<WorktreeRef | null> {
  let text: string;
  try {
    text = await readFile(worktreeRefPath(issue));
  } catch {
    return null;
  }
  try {
    const data = JSON.parse(text) as Partial<WorktreeRef>;
    if (typeof data?.branch === "string" && typeof data?.path === "string") {
      return {
        branch: data.branch,
        path: data.path,
        baseSHA: typeof data.baseSHA === "string" ? data.baseSHA : "",
        ...(typeof data.prUrl === "string" ? { prUrl: data.prUrl } : {}),
      };
    }
  } catch {
    /* empty / malformed -> treat as no ref */
  }
  return null;
}

/** Persist the issue's worktree ref (pretty JSON). */
export async function writeWorktreeRef(
  issue: Pick<Issue, "dir">,
  ref: WorktreeRef,
): Promise<void> {
  await writeFile(worktreeRefPath(issue), `${JSON.stringify(ref, null, 2)}\n`);
}

/**
 * Clear the issue's worktree ref. The IPC contract has no delete command, so we
 * overwrite with an empty file — readWorktreeRef then returns null (JSON.parse
 * of "" throws). Best-effort: a write failure is swallowed.
 */
export async function clearWorktreeRef(
  issue: Pick<Issue, "dir">,
): Promise<void> {
  try {
    await writeFile(worktreeRefPath(issue), "");
  } catch {
    /* nothing to clear / unwritable */
  }
}

/**
 * Build the agent handoff: issue.md + spec.md + an instruction to implement the
 * spec inside the given worktree. Written to <root>/.bezier/handoff/<id>.md
 * (outside the worktree so it never shows up in the diff) for the record, and
 * the same text is returned as `content` so the caller can pass it directly as
 * the agent's prompt argument (the agent runs in the external worktree and may
 * not be able to read a file in the main repo, and arg-passing is more reliable
 * than typing into the TUI after a delay).
 */
/**
 * The Design "考える層" convention (DEC-054/055) as a markdown block, shared by
 * the chat handoff (so design can be produced conversationally) and the Design-tab
 * generator. Carries the foldering/naming rule + the stack-independent grayscale
 * wireframe constraints so a chat request like "デザイン案を3つ" yields correct,
 * board-renderable files with no separate prompt.
 */
export function designConventionBlock(issue: Pick<Issue, "dir">): string[] {
  const dir = `${issue.dir}/design`;
  return [
    "## デザイン別案（Design）— チャットからいつでも作れる",
    "",
    "UI の方向を決めたい時や、ユーザーが「デザイン案を出して」「他の方向は？」と言った時は、**実装コードを書く前に** 下記の規約で **ワイヤー（構造スケッチ）** を作ってください。Bezier の Design ボードに自動で並び、ユーザーが見比べられます（別途プロンプトは不要）。",
    `- **保存先**: \`${dir}/NN-<短いkebab-slug>.html\`（NN=2桁ゼロ埋め連番。既存の最大+1から・**使い回さない＝蓄積**）。例 \`${dir}/01-toolbar-filter.html\`。`,
    "- **スタックに依存しない・自己完結**: **プレーンなインライン CSS のみ**。Tailwind の class・外部 CSS/JS/CDN・外部画像に依存しない（sandboxed iframe で静的描画されるため）。repo の実装は読まず、Spec から自由に発想する。",
    "- **グレースケールの構造スケッチ**（色は使わない／方向差は構造で）。複数頼まれたら **各案を別方向** にして一度に複数ファイル書く。",
    "- 各ファイル先頭に `<title>短い名前</title>` と `<!-- bezier:prompt: 〈方向の一言〉 -->`。",
    "- 書いたらチャットで「案 NN: 〈方向〉」を1行ずつ報告（コード・commit は不要）。",
    "- ユーザーが「案 NN で進めて / 実装して」と言ったら、その方向で **実コード（実物の DS）** に実装する。",
    "",
  ];
}

/**
 * The STABLE Bezier working conventions for an issue (DEC-057 harness), written
 * once to <issue.dir>/BEZIER.md so the per-turn handoff can REFERENCE them rather
 * than re-inject the same blocks every turn (prompt bloat → dropped instructions,
 * e.g. the title not getting set). Combines the living-spec rules, the title
 * reminder, the Design convention, and the Verify expectation.
 */
export function bezierGuide(issue: Issue): string {
  const specPath = slotPath(issue, "spec");
  return [
    "# Bezier — この issue での作法（自動生成。毎ターン従う）",
    "",
    "Bezier 経由でこの issue を進めています。タスク指示が薄くても、以下の共通ルールに従ってください。",
    "",
    "## 生きた Spec",
    `- 仕様書は \`${specPath}\`（worktree の外。\`--add-dir\` で読み書きできます）。`,
    "- **実装の前に必ず spec.md を読み直す**。会話で意図/要件が変わったら **まず spec.md を更新**してから実装し、Spec⇆実装を常に同期する。",
    "- **「受入基準」= 完成の定義（DoD）**。観察可能・チェック可能な文に保つ。**採点はあなたではなく maker** が、Bezier が集めた証拠を見て行う（自己採点はしない）。",
    "",
    "## タイトル",
    "- issue.md の frontmatter `title` が空 or「Untitled」なら、**最優先で**内容を表す簡潔なタイトルに更新する（忘れない）。",
    "",
    ...designConventionBlock(issue),
    "## 受入基準の根拠（実装後に Spec へ付す）",
    "- **採点はしない**（PASS/FAIL を書かない）。代わりに、実装が終わったら spec.md の **各受入基準の直下に「根拠」を1行**付す:",
    "  例: `- [ ] ログインできる`",
    "  　　`  - 根拠: \\`src/auth/login.tsx\\` に実装。⚠️ 認証を変更（要目視）。`",
    "  → 根拠＝**どこに/どう実装したか・関連ファイル**。auth / DB・スキーマ / env / 権限 に触れたら明記。",
    "- チェック（採点）は **maker が** その根拠を見て付けます。あなたの責務は **実装 ＋ 各基準への根拠付与 ＋ 変更点の簡潔な要約** まで。",
    "",
    "## ショートカット（claude スラッシュコマンド・任意）",
    "- maker が Bezier の設定からインストールしていれば、このプロンプトで次のコマンドを呼べます（未導入なら `/` メニューに出ません。その場合は無視して通常通り進めてください）:",
    "  - `/bezier:verify` — 受入基準の直下に「根拠」を1行ずつ付す（採点はしない）",
    "  - `/bezier:spec` — spec.md を読み直して実装と同期する",
    "  - `/bezier:alt3` — デザイン別案を3つ（グレースケールのワイヤー）",
    "  - `/bezier:precommit` — 型・lint・動作を事前チェックして報告する",
    "",
  ].join("\n");
}

export async function buildImplementHandoff(
  root: string,
  issue: Issue,
  worktreePath: string,
  opts?: { followUp?: boolean; userMessage?: string; subPath?: string },
): Promise<{ path: string; content: string }> {
  let issueMd: string;
  try {
    issueMd = await readFile(`${issue.dir}/issue.md`);
  } catch {
    issueMd = issue.body;
  }
  let specMd: string;
  try {
    specMd = await readFile(slotPath(issue, "spec"));
  } catch {
    specMd = "(spec.md がありません)";
  }
  const outPath = `${stripTrailingSlash(root)}/.bezier/handoff/${issue.id}.md`;
  const specPath = slotPath(issue, "spec");
  // On a re-run the worktree already holds the previous iteration's changes; ask
  // the agent to adjust them to the updated spec rather than start over (DEC-012
  // review↔refine cycle).
  // DEC-050 Build loop: every fresh build starts with a short, repo-grounded
  // Clarify (ambiguity removal) and treats the spec's 受入基準 as the Definition
  // of Done — so the agent doesn't race ahead on a vague request, and what it
  // builds is exactly what Verify will later score.
  const intro = opts?.userMessage
    ? [
        `あなたは git worktree \`${worktreePath}\`（branch を切った隔離作業コピー）の中にいます。`,
        "これは **新規 Issue のチャット開始** です。ユーザーの最初のリクエスト（下記）をもとに、次の順で進めてください:",
        "0) **まず Clarify（確認）**: いきなり実装せず、**リポジトリを読んだ上で** 要望の曖昧さを潰す確認を **3〜5 問** してください。各問いには **おすすめの既定値（best-guess）を併記** し、ユーザーが「それで OK」と言うだけで前に進めるように。既存の実装・部品・規約に接地した具体的な問いにし、誘導尋問は避けます。",
        `1) 合意できたら \`${specPath}\` に Spec を書き起こす（テンプレートがあれば埋める）。特に **「受入基準」は観察可能・チェック可能な文で先に確定**（= 完成の定義。後で maker が証拠を見てチェックします）。「やらないこと」で境界も引く。`,
        "2) issue.md の frontmatter の `title` が空または「Untitled」なら、簡潔なタイトルを設定する。",
        "3) **Design ステップ（UI の変更なら）**: 実装の前に、**デザイン別案（ワイヤー）を 2〜3 案**作って方向を見比べてもらう（下記「デザイン別案」の規約に従う）。Design ボードに自動で並びます。ユーザーが方向を選んだら次へ。ロジック中心でビジュアル判断が不要なら、その旨を伝えてスキップして良い。",
        "4) 選ばれた方向で **この worktree 内のコードに実装**する。受入基準を満たすことをゴールにする。",
        "完了したら変更点を簡潔に要約してください（commit は人間が UI から行います）。",
      ]
    : opts?.followUp
      ? [
          `あなたは git worktree \`${worktreePath}\`（branch を切った隔離作業コピー）の中にいます。`,
          "これは **追記の再 Implement 依頼** です。この worktree には前回イテレーションの変更が既に入っています。",
          "**ゼロからやり直さず**、更新後の Issue / Spec（特に **受入基準**）に合わせて既存の変更を調整・拡張してください。",
          "完了したら変更点を簡潔に要約してください（commit は人間が UI から行います）。",
        ]
      : [
          `あなたは git worktree \`${worktreePath}\`（branch を切った隔離作業コピー）の中にいます。`,
          "下記の Issue と Spec を読み、**この worktree 内のコード**に実装してください。",
          "**実装の前に Spec の「受入基準」を確認**してください。空・曖昧なら、いきなり作らず **まず 3〜5 問の確認**（各問いに既定値を併記・リポジトリに接地）をして spec.md を更新してから実装します。",
          "受入基準は「完成の定義」です。これを満たすことをゴールにしてください（後で maker が証拠を見てチェックします）。",
          "完了したら変更点を簡潔に要約してください（commit は人間が UI から行います）。",
        ];
  // Monorepo scope (DEC-039): when the issue is scoped to a subfolder of a
  // larger repo, the agent's cwd IS that subfolder. Tell it to stay within it.
  const monorepoNote = opts?.subPath
    ? [
        `**この作業は monorepo の \`${opts.subPath}/\` パッケージに限定されています。** あなたの作業ディレクトリは既にそこです。原則 \`${opts.subPath}/\` の外（リポジトリの他パッケージや root 設定）は変更しないでください。`,
        "",
      ]
    : [];
  // DEC-057 harness: the STABLE conventions (living-spec rules, title reminder,
  // Design convention, Verify) live in a written BEZIER.md the agent reads — so
  // this per-turn handoff REFERENCES it instead of re-injecting every block each
  // turn (prompt bloat → dropped instructions). Keeps the handoff focused on the
  // task; the spec is still inlined (small + task-specific).
  const guidePath = `${issue.dir}/BEZIER.md`;
  const guideRef = [
    "## 作法（重要・先に読む）",
    `この issue の共通ルールは \`${guidePath}\` にあります（\`--add-dir\` で読めます）。**まず読んでから**進めてください — 生きた Spec / 受入基準=DoD / タイトル更新 / デザイン別案の作り方 / 検証。`,
    "",
  ];
  const content = [
    `# 実装ハンドオフ — ${issue.title || "(無題)"}`,
    "",
    ...intro,
    "",
    ...monorepoNote,
    "---",
    "",
    ...(opts?.userMessage
      ? ["## ユーザーの最初のリクエスト", "", opts.userMessage, "", "---", ""]
      : []),
    ...guideRef,
    "---",
    "",
    "## Issue",
    "",
    issueMd,
    "",
    "## Spec",
    "",
    specMd,
    "",
  ].join("\n");
  // Write the durable guide alongside the handoff (read via --add-dir issue.dir).
  await writeFile(guidePath, bezierGuide(issue));
  await writeFile(outPath, content);
  return { path: outPath, content };
}

/**
 * Build the variant-generation handoff (DEC-053/054, the Design "考える層"). Asks
 * the live agent to write N disposable, **STACK-INDEPENDENT** grayscale wireframes
 * — the divergence half of the hybrid: free visual ideation NOT tied to the repo's
 * framework/components, with the real DS render happening later in Build (R).
 *
 * DEC-054 — foldering + naming rule: each idea is one self-contained HTML file at
 *   <issue.dir>/design/NN-<kebab-slug>.html
 * where NN are the provided zero-padded indices (they accumulate, never reused).
 * Stack-independence is the point: the agent must NOT read or depend on the repo's
 * tech stack here (no Tailwind classes, no framework, no external assets), so
 * design exploration is never entangled with how the repo is built.
 *
 * Reference patterns are LEFT TO THE USER (DEC-054): because the agent IS the
 * user's own Claude Code in their repo, their reference MCP / CLAUDE.md design
 * guidance is already inherited — so the prompt just says "consult whatever
 * reference tools / design guidance you have", never hardcoding a specific source.
 */
export async function buildVariantHandoff(
  root: string,
  issue: Issue,
  worktreePath: string,
  opts: { ids: string[]; context?: string },
): Promise<{ path: string; content: string }> {
  let specMd: string;
  try {
    specMd = await readFile(slotPath(issue, "spec"));
  } catch {
    specMd = "(spec.md がありません)";
  }
  const ids = opts.ids.length ? opts.ids : ["01"];
  const ctx = (opts.context ?? "").trim();
  const designGlob = `${issue.dir}/design/`;
  const outPath = `${stripTrailingSlash(root)}/.bezier/handoff/${issue.id}-variant-${ids.join("")}.md`;
  const content = [
    `# デザイン別案（ワイヤー）— ${issue.title || "(無題)"}`,
    "",
    `あなたの作業ディレクトリは \`${worktreePath}\` です。これは **Design（考える層）** の依頼で、**Implementの前段**でも構いません。`,
    `**実装コードは書かないでください。** 代わりに、**${ids.length} 案**を **それぞれ別の方向**で書き出します。`,
    "",
    "## 出力先と命名（厳守）",
    "",
    `- 保存先フォルダ: \`${designGlob}\``,
    `- ファイル名: **\`NN-<短いkebab-slug>.html\`**。今回使う番号: **${ids.join(" / ")}**（この番号をそのまま使う）。slug は各案の方向の短い名前（英小文字ハイフン）。例: \`${ids[0]}-toolbar-filter.html\` / \`${ids[1] ?? "02"}-column-menu.html\`。`,
    `- 既存ファイルがあれば読み、番号・方向が**重複しない**ようにする（番号は使い回さない＝増えていく）。`,
    "",
    "## スタックに依存しない自由なアイデア（重要）",
    "",
    "- ここは **repo の技術スタックから独立**しています。**repo のフレームワーク・コンポーネント・既存コードを読みに行かない／真似ない**。Spec が示す「何を解くか」から、**自由に**ビジュアルの方向を出す（実装の制約は後段 Implement の仕事）。",
    "- **完全に自己完結した HTML**：**プレーンなインライン CSS のみ**。**Tailwind の class・外部 CSS/JS/CDN・外部画像は使わない**（fully sandboxed iframe で静的描画されるため）。アイコンは文字（▾ × ＋ ⌕ 等）や CSS シェイプで。",
    "",
    "## これは『ワイヤー（構造スケッチ）』— 作り込まない",
    "",
    "- 目的は **レイアウト / 構造 / 情報設計の方向を見比べる**こと。ピクセル忠実は不要（採用案だけ後で Implement が実物を描画）。",
    "- **グレースケール**（白〜グレー: #fff / #f3f4f6 / #e5e7eb / #d1d5db / #9ca3af / #374151 程度）。**色は使わない**（方向差は構造で出す）。本文/ラベルはグレーのバー・箱・短文で represent。",
    "- 各案は別方向に振る：ツールバー型 / 列ヘッダメニュー型 / サイドパネル型、密 vs 余白、タブ vs アコーディオン、一覧 vs カード… 似た案を量産しない。",
    "",
    "## 参照（あなたの環境に委ねる）",
    "",
    "- もし参照ツール（デザイン事例の MCP 等）や、このプロジェクトのデザイン指針（CLAUDE.md / design.md 等）が**あれば**それを踏まえて方向の引き出しを増やす。無ければ無しで良い（Bezier 側は特定ツールを前提にしない）。",
    ctx
      ? `- **方向性の指定: ${ctx}** — これを最優先で反映する。`
      : "- 方向性の指定はなし。Spec から妥当な複数方向を選ぶ。",
    "",
    "## メタ（各ファイル必須）",
    "",
    "- ファイル先頭付近に `<title>この案の短い名前</title>` と `<!-- bezier:prompt: 〈方向の一言〉 -->` を入れる（Bezier がラベルとして読みます）。",
    "",
    "## @参照",
    "",
    `- ユーザー指定に「@01」のような参照があれば、それは番号 01 のアイデア（\`${designGlob}01-*.html\`）を指します。読んで踏まえてください（例:「@02 を密に」「@01 の余白＋@03 の構成」）。`,
    "",
    `書き出したら、チャットで各案を1行ずつ「案 NN: 〈方向〉」と述べてください（コード・commit は不要）。`,
    "",
    "---",
    "",
    "## Spec",
    "",
    specMd,
    "",
  ].join("\n");
  await writeFile(outPath, content);
  return { path: outPath, content };
}

// ---------------------------------------------------------------------------
// v0.5 slice 3 — durable activity thread (chat-first loop, DEC-012)
// ---------------------------------------------------------------------------
//
// A per-issue, structured event log persisted to <root>/.bezier/issues/<ulid>/
// thread.json (the local .bezier store, gitignored). The live agent terminal
// is a volatile pty that dies on leave/restart — this log gives the LEFT thread a
// durable, visible history (起票 / Implement / Re-run / Sync / Accept / Merge /
// Discard / session resumed) that survives even a Discard. It is NOT a chat
// transcript (resume shows the conversation); it is a coarse activity timeline.

export type ThreadEventType =
  | "implement"
  | "rerun"
  | "resume"
  | "sync"
  | "accept"
  | "merge"
  | "pr_opened"
  | "discard"
  | "design_feedback"
  // DEC-050/051: the Build loop's new agent turns — Verify re-checks the spec's
  // 受入基準 against the worktree and reports PASS/FAIL (evals 層A); variant =
  // a Design "考える層" turn (generate / adopt an HTML 別案). (Clarify is folded
  // into the implement handoff today, reserved for when it becomes its own turn.)
  | "clarify"
  | "verify"
  | "variant"
  // §D / DEC-080: a manual checkpoint (commit) was made, or the worktree was
  // rolled back to an earlier checkpoint.
  | "checkpoint"
  | "rollback";

export interface ThreadEvent {
  type: ThreadEventType;
  /** ISO timestamp (new Date().toISOString()). */
  at: string;
  /** Optional human note (e.g. a commit sha, conflict count). */
  note?: string;
  /**
   * Structured record for `accept` events (DEC-014/A): the paths committed and
   * the branch. This is the durable "what changed / where" that replaced
   * decision.md — kept here in thread.json so the JSON log is the single record.
   */
  changedPaths?: string[];
  branch?: string;
}

/** <root>/.bezier/issues/<ulid>/thread.json — the durable activity log. */
function threadPath(root: string, issue: Pick<Issue, "id">): string {
  return `${stripTrailingSlash(root)}/.bezier/issues/${issue.id}/thread.json`;
}

/** Read the issue's activity thread, newest-appended last. [] when none. */
export async function readThread(
  root: string,
  issue: Pick<Issue, "id">,
): Promise<ThreadEvent[]> {
  let text: string;
  try {
    text = await readFile(threadPath(root, issue));
  } catch {
    return [];
  }
  try {
    const data = JSON.parse(text) as unknown;
    if (!Array.isArray(data)) return [];
    return data.filter(
      (e): e is ThreadEvent =>
        !!e &&
        typeof (e as ThreadEvent).type === "string" &&
        typeof (e as ThreadEvent).at === "string",
    );
  } catch {
    return [];
  }
}

/**
 * Append one event to the issue's activity thread and return the new list.
 * Best-effort durability: reads the current log, pushes, and rewrites the whole
 * array (writeFile auto-creates the parent dir). Chronological order (oldest
 * first) so the LEFT thread can render 起票 → … top-to-bottom.
 */
export async function appendThreadEvent(
  root: string,
  issue: Pick<Issue, "id">,
  event: ThreadEvent,
): Promise<ThreadEvent[]> {
  const cur = await readThread(root, issue);
  const next = [...cur, event];
  await writeFile(threadPath(root, issue), `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

// ---------------------------------------------------------------------------
// Open-PR finalize (DEC-015) — the PR body builder.
// ---------------------------------------------------------------------------

/** Human-readable label per thread event type (for the PR activity summary). */
const THREAD_LABELS: Record<ThreadEventType, string> = {
  implement: "Implement 開始",
  rerun: "再 Implement",
  resume: "セッション再開",
  sync: "main を同期",
  accept: "Commit（branch に確定）",
  merge: "main に merge",
  pr_opened: "PR を作成",
  discard: "破棄",
  design_feedback: "デザインFB",
  clarify: "Clarify（確認）",
  verify: "Verify（受入基準を採点）",
  variant: "Design 別案 / 採用",
  checkpoint: "チェックポイント保存",
  rollback: "チェックポイントに戻す",
};

/** Render the durable thread as a compact bulleted activity log. */
function summarizeThread(thread: ThreadEvent[]): string {
  if (!thread.length) return "- （記録なし）";
  return thread
    .map((e) => {
      const when = e.at.slice(0, 19).replace("T", " ");
      const what = THREAD_LABELS[e.type] ?? e.type;
      return `- ${when} — ${what}${e.note ? `（${e.note}）` : ""}`;
    })
    .join("\n");
}

/**
 * Build the PR body (DEC-015 / DEC-008: the "why" rides WITH the PR). Combines
 * the Issue title, the living spec (なぜ / 何を / 受け入れ条件), and a short activity
 * summary from the durable thread. Written to
 * <root>/.bezier/issues/<ulid>/pr-body.md (local, gitignored) and returned so
 * the caller can hand the path to `gh pr create --body-file` (safe for a large
 * multi-line markdown body).
 */
export async function buildPrBody(
  root: string,
  issue: Issue,
  thread: ThreadEvent[],
): Promise<{ path: string; content: string }> {
  let specMd: string;
  try {
    specMd = await readFile(slotPath(issue, "spec"));
  } catch {
    specMd = "(spec.md がありません)";
  }
  const content = [
    `# ${issue.title}`,
    "",
    "<!-- Generated by Bezier (DEC-015). Spec と経緯を PR に同梱（DEC-008: why が what と同じ PR）。 -->",
    "",
    "## Spec",
    "",
    specMd,
    "",
    "## 経緯（activity）",
    "",
    summarizeThread(thread),
    "",
  ].join("\n");
  const path = `${stripTrailingSlash(root)}/.bezier/issues/${issue.id}/pr-body.md`;
  await writeFile(path, content);
  return { path, content };
}
