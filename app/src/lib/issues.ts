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
  type FileEntry,
} from "@/lib/ipc";
import { splitFrontmatter } from "@/lib/markdown";
import { getSettings, getSpecTemplate } from "@/lib/settings";
import { tt, type MsgKey } from "@/lib/i18n";
import {
  designConventionLines,
  bezierGuideDoc,
  implementHandoffDoc,
  variantHandoffDoc,
  specMissingText,
  scaffolds,
  docTemplate,
} from "@/lib/prompts";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import { ulid } from "ulid";
import {
  slugify,
  issueFolderName,
  documentLabel,
  documentRank,
  isUntitled,
  titleFromSpec,
  type IssueStatus,
  type IssueSlot,
  type IssueSlots,
} from "./issue-domain";

// Re-export the pure issue primitives so `@/lib/issues` stays the single public
// entry point. They live in a dependency-free module (issue-domain.ts) so they
// can be unit-tested in isolation (issue-domain.test.ts).
export * from "./issue-domain";

// IssueStatus / ISSUE_STATUSES / DerivedState / deriveState / DERIVED_STATE_META
// / IssueSlot / IssueSlots now live in ./issue-domain (re-exported above).

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

// slugify / issueFolderName now live in ./issue-domain (re-exported above).

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
  const body = `${heading}${scaffolds().issueBody}\n`;
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

/**
 * If an issue is still "Untitled", derive a title from its spec.md H1 and persist
 * it to frontmatter. Returns the new title (so the caller can update local state
 * + refresh the sidebar), or null if nothing changed. Never overwrites a real
 * title — only fills in the placeholder.
 */
export async function autoTitleFromSpec(
  root: string,
  issue: Pick<Issue, "id" | "dir" | "title" | "status" | "created">,
): Promise<string | null> {
  if (!isUntitled(issue.title)) return null;
  let spec: string;
  try {
    spec = await readFile(slotPath(issue, "spec"));
  } catch {
    return null; // no spec yet
  }
  const derived = titleFromSpec(spec);
  if (!derived) return null;
  await updateIssueMeta(root, issue, { title: derived });
  return derived;
}

/** Window event fired when an issue's metadata (e.g. its title) changes, so the
 *  sidebar can re-sync that repo's list without waiting for a navigation. */
export const ISSUE_UPDATED_EVENT = "bezier:issue-updated";

/** Announce that an issue in `repoPath` changed (title/status). No-op off-DOM. */
export function notifyIssueUpdated(repoPath: string): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent(ISSUE_UPDATED_EVENT, { detail: { repoPath } }),
    );
  } catch {
    /* CustomEvent unavailable */
  }
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
// user-customizable in Settings (DEC-043); getSpecTemplate() returns the user's
// override, or the active locale's built-in default (DEC-108).
const SLOT_TEMPLATES: Record<IssueSlot, (issue: Issue) => string> = {
  spec: (issue) => renderTemplate(getSpecTemplate(), issue),
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
   * The base BRANCH this worktree was cut from and that Sync / Merge / PR target
   * (DEC-145). Pinned at creation so it stays correct even if the main repo is
   * later checked out to a different branch. Absent on older refs -> the session
   * falls back to the repo's live current branch (the pre-DEC-145 behavior).
   */
  base?: string;
  /**
   * The PR link for this branch (DEC-015 Open-PR finalize). Since DEC-141 #3 we open
   * GitHub's prefilled compare/create page rather than creating the PR programmatically,
   * so this holds the COMPARE URL — which doubles as the "a PR was opened" marker that
   * gates auto-merge-detection + the re-surfaced "Open PR" link. Persisted so re-opening
   * the issue still surfaces it. Absent until Open PR has been used.
   */
  prUrl?: string;
}

/** branch name convention (DEC-047 G2 / DEC-091): `issue/<ulid>[-<slug>]` — just
 * the ULID for untitled issues (no "-untitled"). */
// ---------------------------------------------------------------------------
// Documents (Document View) — the issue's center is a document space, not a
// single Spec. The Spec spine stays at its legacy root path (back-compat, no
// migration); durable docs the agent creates per the repo's conventions live
// under docs/ and are auto-discovered. Creation is chat-driven; createDocument
// is the secondary, manual quick-start.
// ---------------------------------------------------------------------------

export interface IssueDoc {
  /** Absolute path (stable selection key). */
  path: string;
  /** Bare filename, e.g. "qa.md". */
  file: string;
  /** Filename stem / type, e.g. "qa". */
  type: string;
  /** Display label (known types localized, else humanized). */
  label: string;
}

/** <issue.dir>/docs — durable per-issue documents (presence-driven). */
export function documentsDir(issue: Pick<Issue, "dir">): string {
  return `${issue.dir}/docs`;
}

/**
 * List the issue's documents: the Spec spine (kept at its legacy root path) then
 * everything under docs/, whatever created them (agent, repo conventions, the
 * "+追加" templates). Spec first; known types before ad-hoc. Presence-driven —
 * a missing docs/ just yields the spec.
 */
export async function listDocuments(issue: Issue): Promise<IssueDoc[]> {
  const docs: IssueDoc[] = [];
  const seen = new Set<string>();
  if (issue.slots.spec) {
    docs.push({ path: slotPath(issue, "spec"), file: "spec.md", type: "spec", label: "Spec" });
    seen.add("spec");
  }
  let entries: FileEntry[] = [];
  try {
    entries = await listDir(documentsDir(issue));
  } catch {
    entries = [];
  }
  const extra: IssueDoc[] = [];
  for (const e of entries) {
    if (e.isDir || !/\.mdx?$/i.test(e.name)) continue;
    const type = e.name.replace(/\.mdx?$/i, "");
    if (seen.has(type)) continue;
    seen.add(type);
    extra.push({ path: e.path, file: e.name, type, label: documentLabel(type) });
  }
  extra.sort(
    (a, b) => documentRank(a.type) - documentRank(b.type) || a.type.localeCompare(b.type),
  );
  return [...docs, ...extra];
}

/**
 * Create a document under docs/ from a template — the SECONDARY, manual path
 * (normally the agent writes docs via chat). The scaffold follows the maker's
 * locale (DEC-108). Returns the new doc's path. Never overwrites an existing file.
 */
export async function createDocument(issue: Issue, type: string): Promise<string> {
  const safe = /^[a-z0-9][a-z0-9-]*$/.test(type) ? type : "note";
  const path = `${documentsDir(issue)}/${safe}.md`;
  await writeFile(path, docTemplate(safe) || docTemplate("note"));
  return path;
}

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
  return designConventionLines(`${issue.dir}/design`);
}

/**
 * The STABLE Bezier working conventions for an issue (DEC-057 harness), written
 * once to <issue.dir>/BEZIER.md so the per-turn handoff can REFERENCE them rather
 * than re-inject the same blocks every turn (prompt bloat → dropped instructions,
 * e.g. the title not getting set). Combines the living-spec rules, the title
 * reminder, the Design convention, and the Verify expectation.
 */
export function bezierGuide(issue: Issue): string {
  return bezierGuideDoc(slotPath(issue, "spec"), issue.dir);
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
    specMd = specMissingText();
  }
  const outPath = `${stripTrailingSlash(root)}/.bezier/handoff/${issue.id}.md`;
  const guidePath = `${issue.dir}/BEZIER.md`;
  // The per-turn task instructions (Clarify-first, acceptance criteria = DoD,
  // Design step, monorepo scope) follow the maker's locale (DEC-108). The STABLE
  // conventions are REFERENCED from the written BEZIER.md (DEC-057) rather than
  // re-injected each turn (prompt bloat → dropped instructions).
  const content = implementHandoffDoc({
    worktree: worktreePath,
    issueTitle: issue.title,
    issueMd,
    specMd,
    specPath: slotPath(issue, "spec"),
    guidePath,
    userMessage: opts?.userMessage,
    followUp: opts?.followUp,
    subPath: opts?.subPath,
  });
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
    specMd = specMissingText();
  }
  const ids = opts.ids.length ? opts.ids : ["01"];
  const ctx = (opts.context ?? "").trim();
  const designGlob = `${issue.dir}/design/`;
  const outPath = `${stripTrailingSlash(root)}/.bezier/handoff/${issue.id}-variant-${ids.join("")}.md`;
  // Stack-independent grayscale wireframes; the prompt follows the maker's locale
  // (DEC-108). Naming/convention details live in @/lib/prompts.
  const content = variantHandoffDoc({
    worktree: worktreePath,
    issueTitle: issue.title,
    ids,
    ctx,
    designGlob,
    specMd,
  });
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

/** A note for a thread event: either a raw string (a sha / commit message —
 * not translatable) or a STRUCTURED i18n ref ({key, params}) that's resolved in
 * the reader's locale at RENDER time (DEC-108) — never frozen at write time. */
export type ThreadNote = string | { key: MsgKey; params?: Record<string, string | number> };

export interface ThreadEvent {
  type: ThreadEventType;
  /** ISO timestamp (new Date().toISOString()). */
  at: string;
  /** Optional raw note (e.g. a commit sha) — shown verbatim (back-compat). */
  note?: string;
  /** Optional i18n note key, resolved at render time (DEC-108). */
  noteKey?: string;
  /** Params for noteKey. */
  noteParams?: Record<string, string | number>;
  /**
   * Structured record for `accept` events (DEC-014/A): the paths committed and
   * the branch. This is the durable "what changed / where" that replaced
   * decision.md — kept here in thread.json so the JSON log is the single record.
   */
  changedPaths?: string[];
  branch?: string;
}

/** Resolve a thread event's note in the current locale (DEC-108): the i18n key
 * if present, else the raw string. Empty when neither. */
export function threadNoteText(e: Pick<ThreadEvent, "note" | "noteKey" | "noteParams">): string {
  if (e.noteKey) return tt(e.noteKey as MsgKey, e.noteParams);
  return e.note ?? "";
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

/** Render the durable thread as a compact bulleted activity log (PR body). Event
 * labels follow the maker's locale via the shared issuesPage.threadEvent keys
 * (DEC-108); the free-text note is still as the agent wrote it (deferred). */
function summarizeThread(thread: ThreadEvent[]): string {
  if (!thread.length) return `- ${tt("issuesPage.noRecords")}`;
  return thread
    .map((e) => {
      const when = e.at.slice(0, 19).replace("T", " ");
      const what = tt(`issuesPage.threadEvent.${e.type}`);
      const note = threadNoteText(e);
      return `- ${when} — ${what}${note ? `（${note}）` : ""}`;
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
  // The committed handoff file's repo-relative path, ONLY when it was actually
  // written + committed into the branch (heuristic #2). Omitted → no pointer, so the
  // PR body never points at a `docs/handoff/<id>.md` that doesn't exist in the diff.
  handoffPath?: string,
): Promise<{ path: string; content: string }> {
  let specMd: string;
  try {
    specMd = await readFile(slotPath(issue, "spec"));
  } catch {
    specMd = specMissingText();
  }
  const s = scaffolds();
  const content = [
    `# ${issue.title}`,
    "",
    s.prComment,
    "",
    ...(handoffPath
      ? [
          `> 📋 実装ハンドオフ（受入基準・QA・決定・preview env）は \`${handoffPath}\` にこの PR の diff として同梱しています。clone するだけで意図がすべて手に入ります。`,
          "",
        ]
      : []),
    "## Spec",
    "",
    specMd,
    "",
    s.prActivityHeader,
    "",
    summarizeThread(thread),
    "",
  ].join("\n");
  const path = `${stripTrailingSlash(root)}/.bezier/issues/${issue.id}/pr-body.md`;
  await writeFile(path, content);
  return { path, content };
}
