// Issues data layer (v0.5 slice 1 — pre-git, local).
//
// Every issue is a folder under <root>/.continuum/drafts/<ulid>-<slug>/ (the
// .continuum tree is gitignored). issue.md holds the metadata (frontmatter) +
// description (body); the spec / decision "slots" are convention-path
// files that exist only once created ("presence-driven", §3.5 / P5).
//
// Reuse only: ipc (listDir/readFile/writeFile — writeFile auto-creates parent
// dirs) and markdown.splitFrontmatter (byte-preserving split). Frontmatter is
// parsed/emitted via the `yaml` package directly so fields beyond the typed
// Frontmatter shape (id / labels / screens) survive round-trips.

import { listDir, readFile, writeFile } from "@/lib/ipc";
import { splitFrontmatter } from "@/lib/markdown";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import { ulid } from "ulid";

export type IssueStatus = "open" | "in-progress" | "merged";

export const ISSUE_STATUSES: IssueStatus[] = ["open", "in-progress", "merged"];

// DEC-011: the Design slot is removed (design intent lives in the Spec; the
// output is the PR/code diff itself). Decision is no longer hand-written — it is
// auto-drafted on Accept (see draftDecision) — but it remains a readable slot.
export type IssueSlot = "spec" | "decision";

export interface IssueSlots {
  spec: boolean;
  decision: boolean;
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

export interface DecisionEntry {
  issueId: string;
  issueTitle: string;
  /** Absolute path to the decision.md file. */
  path: string;
  /** Decision title (first heading, falling back to the issue title). */
  title: string;
  /** frontmatter `decided` (may be empty). */
  decided: string;
  /** frontmatter `status` (accepted | superseded | ""). */
  status: string;
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/** <root>/.continuum/drafts — the local working store for issues (slice 1). */
export function draftsDir(root: string): string {
  return `${stripTrailingSlash(root)}/.continuum/drafts`;
}

/** Absolute path to a slot file for an issue. */
export function slotPath(issue: Pick<Issue, "dir">, slot: IssueSlot): string {
  switch (slot) {
    case "spec":
      return `${issue.dir}/spec.md`;
    case "decision":
      return `${issue.dir}/decision.md`;
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
      decision: names.has("decision.md"),
    },
  };
}

/** List all issues under .continuum/drafts, newest first (ULID is time-sortable). */
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
  await writeFile(`${dir}/issue.md`, `${fm}${body}`);
  return {
    id,
    slug,
    dir,
    title: cleanTitle || "Untitled",
    status: "open",
    created,
    body,
    slots: { spec: false, decision: false },
  };
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

// Only Spec is hand-created via createSlot now (DEC-011). The decision template
// is retained for type-completeness / fallback, but Decision is normally
// auto-drafted on Accept by draftDecision (below), not via createSlot.
const SLOT_TEMPLATES: Record<IssueSlot, (issue: Issue) => string> = {
  spec: (issue) =>
    `---\nissue: ${issue.id}\n---\n# ${issue.title} — Spec\n\n## なぜ\n<!-- 背景・課題・なぜ今やるのか -->\n\n## 何を\n<!-- 何を作るのか -->\n\n## 受入基準\n- [ ] \n- [ ] \n\n## やらないこと\n- \n\n## 未解決\n- \n`,
  decision: (issue) =>
    `---\nissue: ${issue.id}\nstatus: accepted\ndecided: ${new Date().toISOString().slice(0, 10)}\n---\n# ${issue.title} — Decision\n\n## 文脈\n<!-- spec の「なぜ」から -->\n\n## 決定\n<!-- spec の「何を」から -->\n\n## 代替案\n<!-- 検討して却下した案 -->\n\n## 影響・触れた所\n<!-- 対象画面 / 変更したパス -->\n\n## 関連\n- \n`,
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
// Decisions aggregation
// ---------------------------------------------------------------------------

function firstHeading(body: string): string | null {
  const m = /^#{1,6}\s+(.+?)\s*$/m.exec(body);
  return m ? m[1].trim() : null;
}

/** Aggregate every issue's decision.md into a flat, newest-first list. */
export async function listDecisions(root: string): Promise<DecisionEntry[]> {
  const issues = await listIssues(root);
  const out: DecisionEntry[] = [];
  for (const issue of issues) {
    if (!issue.slots.decision) continue;
    const path = slotPath(issue, "decision");
    let text: string;
    try {
      text = await readFile(path);
    } catch {
      continue;
    }
    const { rawFrontmatter, body } = splitFrontmatter(text);
    const fm = parseFm(rawFrontmatter);
    out.push({
      issueId: issue.id,
      issueTitle: issue.title,
      path,
      title: firstHeading(body) ?? issue.title,
      decided: asString(fm.decided) ?? "",
      status: asString(fm.status) ?? "",
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// v0.5 slice 2 — implementation loop (branch / worktree / handoff / decision)
// ---------------------------------------------------------------------------

/**
 * Volatile reference to an Issue's git worktree. Persisted as JSON beside the
 * issue (issue.dir/worktree.json) — gitignored, like the rest of .continuum.
 */
export interface WorktreeRef {
  /** branch name (issue/<ulid>-<slug>). */
  branch: string;
  /** Absolute worktree path (<root>/.continuum/worktrees/<ulid>). */
  path: string;
  /** SHA the branch was created off (best-effort; may be empty). */
  baseSHA: string;
}

/** branch name convention (DEC-009 G2): `issue/<ulid>-<slug>`. */
export function branchName(issue: Pick<Issue, "id" | "slug">): string {
  return `issue/${issue.id}-${issue.slug || "untitled"}`;
}

/** Absolute worktree path for an issue: <root>/.continuum/worktrees/<ulid>. */
export function worktreeDir(root: string, issue: Pick<Issue, "id">): string {
  return `${stripTrailingSlash(root)}/.continuum/worktrees/${issue.id}`;
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
 * spec inside the given worktree. Written to <root>/.continuum/handoff/<id>.md
 * (outside the worktree so it never shows up in the diff). Returns its path.
 */
export async function buildImplementHandoff(
  root: string,
  issue: Issue,
  worktreePath: string,
): Promise<string> {
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
  const outPath = `${stripTrailingSlash(root)}/.continuum/handoff/${issue.id}.md`;
  const content = [
    `# 実装ハンドオフ — ${issue.title}`,
    "",
    `あなたは git worktree \`${worktreePath}\`（branch を切った隔離作業コピー）の中にいます。`,
    "下記の Issue と Spec を読み、**この worktree 内のコード**に実装してください。",
    "完了したら変更点を簡潔に要約してください（commit は人間が UI から行います）。",
    "",
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
  return outPath;
}

/** Extract the body text under a `## <heading>` section of a markdown doc. */
function sectionBody(md: string, heading: string): string {
  const lines = md.split("\n");
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headRe = new RegExp(`^#{1,6}\\s+${escaped}\\s*$`);
  const start = lines.findIndex((l) => headRe.test(l.trim()));
  if (start < 0) return "";
  const collected: string[] = [];
  for (let j = start + 1; j < lines.length; j++) {
    if (/^#{1,6}\s+/.test(lines[j])) break;
    collected.push(lines[j]);
  }
  return collected
    .join("\n")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
}

/**
 * Auto-draft decision.md on Accept (DEC-011). ADR shape (§3.5): 文脈 from the
 * spec「なぜ」, 決定 from spec「何を」, 影響 from the changed paths + issue.screens,
 * 関連 = branch + spec. Overwrites any existing decision.md (it is generated, the
 * human refines later). Returns the decision.md path.
 */
export async function draftDecision(
  root: string,
  issue: Issue,
  opts: { changedPaths: string[]; branch: string },
): Promise<string> {
  let specText = "";
  try {
    specText = await readFile(slotPath(issue, "spec"));
  } catch {
    /* no spec -> placeholders below */
  }
  const why = sectionBody(specText, "なぜ") || "<!-- spec の「なぜ」から -->";
  const what = sectionBody(specText, "何を") || "<!-- spec の「何を」から -->";
  const decided = new Date().toISOString().slice(0, 10);

  const impactLines = [
    ...opts.changedPaths.map((p) => `- \`${p}\``),
    ...(issue.screens ?? []).map((s) => `- 画面: ${s}`),
  ];
  const impact = impactLines.length ? impactLines.join("\n") : "- （変更なし）";
  const related = [`- branch: \`${opts.branch}\``, "- spec: `spec.md`"].join("\n");

  const content = `---\nissue: ${issue.id}\nstatus: accepted\ndecided: ${decided}\n---\n# ${issue.title} — Decision\n\n## 文脈\n${why}\n\n## 決定\n${what}\n\n## 代替案\n<!-- 検討して却下した案（人が PR で追記） -->\n\n## 影響・触れた所\n${impact}\n\n## 関連\n${related}\n`;
  const path = slotPath(issue, "decision");
  await writeFile(path, content);
  return path;
}
