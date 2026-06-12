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

/** kebab-case ASCII slug; falls back to "untitled" when nothing survives. */
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "untitled";
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
  const dir = `${draftsDir(root)}/${id}-${slug}`;
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
  const folderName = `${issue.id}-${issue.slug}`;
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
  const folderName = `${meta.id}-${meta.slug}`;
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
  await removePath(`${trashDraftsDir(root)}/${meta.id}-${meta.slug}`);
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

/** branch name convention (DEC-047 G2): `issue/<ulid>-<slug>`. */
export function branchName(issue: Pick<Issue, "id" | "slug">): string {
  return `issue/${issue.id}-${issue.slug || "untitled"}`;
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
  const intro = opts?.userMessage
    ? [
        `あなたは git worktree \`${worktreePath}\`（branch を切った隔離作業コピー）の中にいます。`,
        "これは **新規 Issue のチャット開始** です。ユーザーの最初のリクエスト（下記）をもとに、次の順で進めてください:",
        `1) まず \`${specPath}\` に Spec を書き起こす（既にテンプレートがあれば埋める）。なぜ/何を/受入基準を具体化する。`,
        "2) issue.md の frontmatter の `title` が空または「Untitled」なら、簡潔なタイトルを設定する。",
        "3) その後にこの worktree 内のコードへ実装する。",
        "不明点があれば、いきなり実装せず **まず質問** してください（チャットで対話できます）。",
        "完了したら変更点を簡潔に要約してください（commit は人間が UI から行います）。",
      ]
    : opts?.followUp
      ? [
          `あなたは git worktree \`${worktreePath}\`（branch を切った隔離作業コピー）の中にいます。`,
          "これは **追記の再実装依頼** です。この worktree には前回イテレーションの変更が既に入っています。",
          "**ゼロからやり直さず**、更新後の Issue / Spec に合わせて既存の変更を調整・拡張してください。",
          "完了したら変更点を簡潔に要約してください（commit は人間が UI から行います）。",
        ]
      : [
          `あなたは git worktree \`${worktreePath}\`（branch を切った隔離作業コピー）の中にいます。`,
          "下記の Issue と Spec を読み、**この worktree 内のコード**に実装してください。",
          "完了したら変更点を簡潔に要約してください（commit は人間が UI から行います）。",
        ];
  // The Spec is the LIVING spec for this issue. It lives OUTSIDE the worktree
  // (in the main repo's .bezier tree) but is made readable+writable to the
  // agent via `claude --add-dir <issue.dir>`. Telling the agent to (1) re-read it
  // before every implementation and (2) update it when the conversation changes
  // the intent keeps Spec⇆code in sync without the human manually saying
  // "re-read" each turn (DEC-012 chat-first loop).
  const livingSpec = [
    `## 生きた仕様 (Spec)`,
    "",
    `この issue の仕様書は \`${specPath}\` です。worktree の外にありますが、\`--add-dir\` で **読み書きできます**。`,
    "- **実装の前に必ず spec.md を読み直して**、最新の仕様に従ってください（毎回・自動で）。",
    "- 会話で意図や要件が変わったら、**まず spec.md を更新**してから実装し、Spec と実装を常に同期させてください。",
    "",
  ];
  // Monorepo scope (DEC-039): when the issue is scoped to a subfolder of a
  // larger repo, the agent's cwd IS that subfolder. Tell it to stay within it.
  const monorepoNote = opts?.subPath
    ? [
        `**この作業は monorepo の \`${opts.subPath}/\` パッケージに限定されています。** あなたの作業ディレクトリは既にそこです。原則 \`${opts.subPath}/\` の外（リポジトリの他パッケージや root 設定）は変更しないでください。`,
        "",
      ]
    : [];
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
    ...livingSpec,
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
  | "design_feedback";

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
  implement: "実装開始",
  rerun: "再実装",
  resume: "セッション再開",
  sync: "main を同期",
  accept: "Commit（branch に確定）",
  merge: "main に merge",
  pr_opened: "PR を作成",
  discard: "破棄",
  design_feedback: "デザインFB",
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
