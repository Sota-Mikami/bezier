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

import { listDir, readFile, writeFile, appDataDir } from "@/lib/ipc";
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
// v0.5 slice 2 — implementation loop (branch / worktree / handoff / decision)
// ---------------------------------------------------------------------------

/**
 * Volatile reference to an Issue's git worktree. Persisted as JSON beside the
 * issue (issue.dir/worktree.json) — gitignored, like the rest of .continuum.
 */
export interface WorktreeRef {
  /** branch name (issue/<ulid>-<slug>). */
  branch: string;
  /**
   * Absolute worktree path. Since slice 2.5.1 this lives OUTSIDE the repo, under
   * <appData>/worktrees/<repo-id>/<ulid> (see worktreeDir). Older refs may point
   * inside the repo (<root>/.continuum/worktrees/<ulid>); both are honored on
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

/** branch name convention (DEC-009 G2): `issue/<ulid>-<slug>`. */
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
 * A worktree nested inside the repo (the old <root>/.continuum/worktrees/...)
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
 * spec inside the given worktree. Written to <root>/.continuum/handoff/<id>.md
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
  opts?: { followUp?: boolean },
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
  const outPath = `${stripTrailingSlash(root)}/.continuum/handoff/${issue.id}.md`;
  const specPath = slotPath(issue, "spec");
  // On a re-run the worktree already holds the previous iteration's changes; ask
  // the agent to adjust them to the updated spec rather than start over (DEC-012
  // review↔refine cycle).
  const intro = opts?.followUp
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
  // (in the main repo's .continuum tree) but is made readable+writable to the
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
  const content = [
    `# 実装ハンドオフ — ${issue.title}`,
    "",
    ...intro,
    "",
    "---",
    "",
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

// ---------------------------------------------------------------------------
// v0.5 slice 3 — durable activity thread (chat-first loop, DEC-012)
// ---------------------------------------------------------------------------
//
// A per-issue, structured event log persisted to <root>/.continuum/issues/<ulid>/
// thread.json (the local .continuum store, gitignored). The live agent terminal
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
  | "discard";

export interface ThreadEvent {
  type: ThreadEventType;
  /** ISO timestamp (new Date().toISOString()). */
  at: string;
  /** Optional human note (e.g. a commit sha, conflict count). */
  note?: string;
}

/** <root>/.continuum/issues/<ulid>/thread.json — the durable activity log. */
function threadPath(root: string, issue: Pick<Issue, "id">): string {
  return `${stripTrailingSlash(root)}/.continuum/issues/${issue.id}/thread.json`;
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
  accept: "Accept（branch に commit）",
  merge: "main に merge",
  pr_opened: "PR を作成",
  discard: "破棄",
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
 * <root>/.continuum/issues/<ulid>/pr-body.md (local, gitignored) and returned so
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
    "<!-- Generated by continuum (DEC-015). Spec と経緯を PR に同梱（DEC-008: why が what と同じ PR）。 -->",
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
  const path = `${stripTrailingSlash(root)}/.continuum/issues/${issue.id}/pr-body.md`;
  await writeFile(path, content);
  return { path, content };
}
