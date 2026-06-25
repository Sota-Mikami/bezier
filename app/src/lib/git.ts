// FROZEN CONTRACT (v0.5 slice 2) — git worktree / diff bindings.
//
// Thin wrappers over the Rust git commands (src-tauri/src/lib.rs), invoked the
// same way as src/lib/ipc.ts. Tauri maps these camelCase JS arg keys to the
// Rust commands' snake_case params automatically (e.g. worktreePath ->
// worktree_path), so the key spellings below are part of the contract.
//
// The "implementation loop" uses these to: create a branch + worktree off the
// repo HEAD, let an agent implement in that worktree, read the uncommitted diff,
// then either commit it on the branch (Accept) or remove the worktree+branch
// (Discard). Every command rejects path-traversal on the Rust side.

import { invoke } from "@tauri-apps/api/core";

/** True if `path` is inside a git work tree. -> invoke("git_is_repo", { path }) */
export function gitIsRepo(path: string): Promise<boolean> {
  return invoke<boolean>("git_is_repo", { path });
}

/** Git state of a folder for the open-folder guardrails (DEC-035). */
export interface RepoStatus {
  /** Inside any git work tree. */
  isRepo: boolean;
  /** Absolute toplevel path, or "" when not a repo. */
  toplevel: string;
  /** The opened path IS the toplevel (the good case). */
  isToplevel: boolean;
}

/** Classify a folder: repo root / subfolder of a repo / not a repo. */
export function gitRepoStatus(path: string): Promise<RepoStatus> {
  return invoke<RepoStatus>("git_repo_status", { path });
}

/** `git init` + initial commit, so a plain folder becomes Bezier-usable. */
export function gitInit(path: string): Promise<void> {
  return invoke<void>("git_init", { path });
}

/**
 * Create `branch` off `base` and add a worktree at `worktreePath`. `base` is a
 * commit-ish (local branch, `origin/feat-x`, or "" -> the repo's current HEAD;
 * DEC-145). Existing branch is attached; an existing worktree path errors.
 * -> invoke("git_worktree_add", { repo, branch, worktreePath, base })
 */
export function gitWorktreeAdd(
  repo: string,
  branch: string,
  worktreePath: string,
  base: string,
): Promise<void> {
  return invoke<void>("git_worktree_add", { repo, branch, worktreePath, base });
}

/**
 * Uncommitted diff of `worktreePath` (the agent's work, untracked files
 * included). -> invoke("git_diff", { worktreePath })
 */
export function gitDiff(worktreePath: string): Promise<string> {
  return invoke<string>("git_diff", { worktreePath });
}

/**
 * Porcelain status of `worktreePath` (changed-file list).
 * -> invoke("git_status", { worktreePath })
 */
export function gitStatus(worktreePath: string): Promise<string> {
  return invoke<string>("git_status", { worktreePath });
}

/**
 * Stage all + commit in `worktreePath`. Resolves to the new commit SHA. Rejects
 * with git's stderr (e.g. "nothing to commit") on failure.
 * -> invoke("git_commit_all", { worktreePath, message })
 */
export function gitCommitAll(
  worktreePath: string,
  message: string,
): Promise<string> {
  return invoke<string>("git_commit_all", { worktreePath, message });
}

/** One checkpoint = one commit on the issue branch (§D / DEC-080). */
export interface Checkpoint {
  /** full SHA */
  sha: string;
  /** short SHA */
  short: string;
  /** commit message subject */
  subject: string;
  /** committer ISO date */
  iso: string;
}

/**
 * The issue branch's own commits (`<base>..HEAD`, newest first) = its checkpoints.
 * -> invoke("git_log", { worktreePath, base })
 */
export function gitLog(worktreePath: string, base: string): Promise<Checkpoint[]> {
  return invoke<Checkpoint[]>("git_log", { worktreePath, base });
}

/**
 * Roll the worktree back to a checkpoint commit (`reset --hard <sha>`). Later
 * commits + uncommitted changes are discarded (reflog-recoverable); main is never
 * touched. -> invoke("git_reset_hard", { worktreePath, sha })
 */
export function gitResetHard(worktreePath: string, sha: string): Promise<void> {
  return invoke<void>("git_reset_hard", { worktreePath, sha });
}

/**
 * Remove the worktree at `worktreePath` (force, discarding its changes).
 * -> invoke("git_worktree_remove", { repo, worktreePath })
 */
export function gitWorktreeRemove(
  repo: string,
  worktreePath: string,
): Promise<void> {
  return invoke<void>("git_worktree_remove", { repo, worktreePath });
}

/**
 * Force-delete `branch` from `repo` (used by Discard after worktree removal).
 * -> invoke("git_branch_delete", { repo, branch })
 */
export function gitBranchDelete(repo: string, branch: string): Promise<void> {
  return invoke<void>("git_branch_delete", { repo, branch });
}

// ---------------------------------------------------------------------------
// Merge-safety layer (OPEN-001) — behind/ahead, Sync-with-main, dry-run
// conflict check, guarded merge-to-main. Thin wrappers over the Rust commands;
// Tauri maps the camelCase arg keys to snake_case params (worktreePath ->
// worktree_path, repoPath -> repo_path).
// ---------------------------------------------------------------------------

/** How far the worktree's branch is behind/ahead of `base`. */
export interface BehindAhead {
  /** commits in base not in the branch (work the branch is missing). */
  behind: number;
  /** commits in the branch not in base (the branch's own work). */
  ahead: number;
}

/**
 * Behind/ahead of the worktree's current branch vs `base` (default caller passes
 * "main"). -> invoke("git_behind_ahead", { worktreePath, base })
 */
export function gitBehindAhead(
  worktreePath: string,
  base: string,
): Promise<BehindAhead> {
  return invoke<BehindAhead>("git_behind_ahead", { worktreePath, base });
}

/**
 * The repo's integration branch — the branch the MAIN repo working tree is on,
 * which is exactly what `gitMergeToMain` merges into. The merge-safety checks
 * pass this as their `base` so they match the real merge target instead of a
 * hardcoded "main" (OPEN-001). -> invoke("git_base_branch", { repoPath })
 */
export function gitBaseBranch(repoPath: string): Promise<string> {
  return invoke<string>("git_base_branch", { repoPath });
}

/** Branches available as a base for a new issue's worktree (DEC-145): the repo's
 *  CURRENT branch (the default) plus the other local + remote-tracking branches.
 *  -> invoke("git_list_branches", { repoPath }) */
export interface BranchList {
  current: string;
  branches: string[];
}
export function gitListBranches(repoPath: string): Promise<BranchList> {
  return invoke<BranchList>("git_list_branches", { repoPath });
}

// ---------------------------------------------------------------------------
// Repo freshness (DEC-111 Phase 2) — is the repo's default branch behind origin,
// and a SAFE fast-forward-only one-click update. Separate from the merge-safety
// layer below (that is per-issue-worktree vs base; this is base vs origin/base on
// the root checkout).
// ---------------------------------------------------------------------------

/**
 * Best-effort `git fetch origin` to refresh remote-tracking refs. Resolves
 * `false` when there's no `origin` (nothing to fetch); rejects on offline/auth
 * failure (callers swallow it). -> invoke("git_fetch", { repoPath })
 */
export function gitFetch(repoPath: string): Promise<boolean> {
  return invoke<boolean>("git_fetch", { repoPath });
}

/** Snapshot of the default branch vs its origin upstream (no network). */
export interface DefaultBehind {
  /** local default branch ("" if detached/unknown). */
  base: string;
  /** the remote ref compared against, e.g. "origin/main" ("" if none). */
  upstream: string;
  hasRemote: boolean;
  hasUpstream: boolean;
  /** commits on the upstream the local branch is missing. */
  behind: number;
  /** local commits the upstream is missing (>0 = diverged). */
  ahead: number;
  dirty: boolean;
}

/**
 * Snapshot how the default branch compares to its origin upstream — drives the
 * non-blocking freshness banner. Does NOT fetch; call `gitFetch` first to
 * refresh. -> invoke("git_default_behind", { repoPath })
 */
export function gitDefaultBehind(repoPath: string): Promise<DefaultBehind> {
  return invoke<DefaultBehind>("git_default_behind", { repoPath });
}

/** Result of the one-click "update default branch" action. */
export interface UpdateResult {
  /** true = fast-forwarded (or already up to date). */
  ok: boolean;
  /** local branch has its own commits — ff impossible, handed off. */
  diverged: boolean;
  /** dirty tree overlapped the incoming changes — nothing changed. */
  blocked: boolean;
  /** commits still behind (0 on success). */
  behind: number;
  /** git output / reason, for the banner message. */
  message: string;
}

/**
 * SAFE fast-forward-only update of the default branch toward origin. Never
 * conflicts, never discards uncommitted work, never auto-merges a diverged
 * branch (hands off instead). -> invoke("git_update_default", { repoPath })
 */
export function gitUpdateDefault(repoPath: string): Promise<UpdateResult> {
  return invoke<UpdateResult>("git_update_default", { repoPath });
}

/** Result of Sync-with-main. */
export interface SyncResult {
  /** true = clean merge; false = conflicted (worktree left conflicted). */
  ok: boolean;
  /** conflicted file paths when `ok` is false. */
  conflicts: string[];
}

/**
 * Merge `base` INTO the worktree's branch. On conflict the worktree is LEFT
 * conflicted (resolve in the worktree terminal, then commit — main untouched).
 * -> invoke("git_sync_main", { worktreePath, base })
 */
export function gitSyncMain(
  worktreePath: string,
  base: string,
): Promise<SyncResult> {
  return invoke<SyncResult>("git_sync_main", { worktreePath, base });
}

/** Result of the dry-run conflict check. */
export interface ConflictCheck {
  /** true = merging base into the branch would NOT conflict. */
  clean: boolean;
  /** conflicted file paths when `clean` is false. */
  files: string[];
}

/**
 * DRY-RUN: would merging `base` and the worktree's branch conflict? Touches
 * nothing on disk (git merge-tree --write-tree).
 * -> invoke("git_merge_conflict_check", { worktreePath, base })
 */
export function gitMergeConflictCheck(
  worktreePath: string,
  base: string,
): Promise<ConflictCheck> {
  return invoke<ConflictCheck>("git_merge_conflict_check", {
    worktreePath,
    base,
  });
}

/**
 * GUARDED merge of `branch` into the MAIN repo's current branch. Rejects (clear
 * Err) when the working tree is dirty or the branch is behind/conflicts — the
 * caller must Sync first. Resolves to git's merge output on success.
 * -> invoke("git_merge_to_main", { repoPath, branch })
 */
export function gitMergeToMain(
  repoPath: string,
  branch: string,
): Promise<string> {
  return invoke<string>("git_merge_to_main", { repoPath, branch });
}

// ---------------------------------------------------------------------------
// Open-PR finalize path (DEC-015) — push the Issue branch + open a GitHub PR
// via `gh`, so review/CI/merge happen on the platform and `main` is never
// touched locally. The default finalize action for repos with a GitHub remote;
// git_merge_to_main is demoted to a solo/local opt-in. Tauri maps camelCase JS
// arg keys to the Rust snake_case params (worktreePath -> worktree_path,
// repoPath -> repo_path, bodyFilePath -> body_file_path).
// ---------------------------------------------------------------------------

/**
 * origin's remote URL — used to detect whether this repo can Open a PR. Rejects
 * (Err) when the repo has no `origin` remote.
 * -> invoke("git_remote_url", { repoPath })
 */
export function gitRemoteUrl(repoPath: string): Promise<string> {
  return invoke<string>("git_remote_url", { repoPath });
}

/** Extract "owner/repo" from a GitHub remote URL (https or ssh form), or null. */
export function gitHubSlug(remoteUrl: string): string | null {
  const m = remoteUrl.trim().match(/github\.com[:/]([^/]+\/[^/\s]+?)(?:\.git)?\/?$/i);
  return m ? m[1] : null;
}

/**
 * Push the worktree's `branch` to origin (`push -u origin <branch>`). Commits a
 * WIP first if the worktree is dirty (same as Sync), so the PR carries the
 * agent's work. Resolves to git's push summary.
 * -> invoke("git_push", { worktreePath, branch })
 */
export function gitPush(worktreePath: string, branch: string): Promise<string> {
  return invoke<string>("git_push", { worktreePath, branch });
}

/**
 * Open a GitHub PR for `branch` via `gh pr create` (cwd = repoPath) against `base`,
 * with the body read from `bodyFilePath` (`--body-file`, safe for a large markdown
 * handoff — no URL length limit). `draft` creates a draft PR (the maker reviews in the
 * browser, then "Ready for review"). Resolves to the real PR URL; if a PR already
 * exists for the branch, resolves to its URL. Never touches `main`.
 * -> invoke("gh_pr_create", { repoPath, branch, title, bodyFilePath, base, draft })
 */
export function ghPrCreate(
  repoPath: string,
  branch: string,
  title: string,
  bodyFilePath: string,
  base: string,
  draft: boolean,
): Promise<string> {
  return invoke<string>("gh_pr_create", {
    repoPath,
    branch,
    title,
    bodyFilePath,
    base,
    draft,
  });
}

/**
 * PR state for `branch` ("OPEN" / "MERGED" / "CLOSED"), or "" if none / gh
 * missing. Best-effort, never throws — used to auto-mark an issue done when its
 * PR merges on the platform. -> invoke("gh_pr_state", { repoPath, branch })
 */
export function ghPrState(repoPath: string, branch: string): Promise<string> {
  return invoke<string>("gh_pr_state", { repoPath, branch });
}

// ---------------------------------------------------------------------------
// Diff parsing (presentation helper, used by the Changes view)
// ---------------------------------------------------------------------------

/** One line of a rendered unified diff, classified for colouring. */
export interface DiffLine {
  kind: "add" | "del" | "hunk" | "meta" | "context";
  text: string;
}

/**
 * Classify each line of a `git diff` text for display. Pure/strings-only so it
 * stays SSG-safe and testable. `+`/`-` are additions/deletions, `@@` hunks,
 * `diff`/`index`/`+++`/`---`/`new file`/etc. are metadata.
 */
export function parseDiff(diff: string): DiffLine[] {
  if (!diff) return [];
  return diff.split("\n").map((text): DiffLine => {
    if (text.startsWith("@@")) return { kind: "hunk", text };
    if (
      text.startsWith("diff ") ||
      text.startsWith("index ") ||
      text.startsWith("+++") ||
      text.startsWith("---") ||
      text.startsWith("new file") ||
      text.startsWith("deleted file") ||
      text.startsWith("rename ") ||
      text.startsWith("similarity ") ||
      text.startsWith("old mode") ||
      text.startsWith("new mode") ||
      text.startsWith("\\ No newline")
    ) {
      return { kind: "meta", text };
    }
    if (text.startsWith("+")) return { kind: "add", text };
    if (text.startsWith("-")) return { kind: "del", text };
    return { kind: "context", text };
  });
}

/**
 * Parse `git status --porcelain` output into a flat list of changed paths.
 * Each line is `XY <path>` (or `XY <old> -> <new>` for renames — we keep the new
 * path). Quoted paths (spaces / unicode) are unquoted best-effort.
 */
export function changedPathsFromStatus(status: string): string[] {
  return status
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .filter(Boolean)
    .map((l) => {
      const rest = l.slice(3); // drop the 2 status chars + separating space
      const arrow = rest.indexOf(" -> ");
      const path = arrow >= 0 ? rest.slice(arrow + 4) : rest;
      return path.replace(/^"(.*)"$/, "$1");
    });
}
