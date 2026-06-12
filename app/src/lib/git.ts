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

/**
 * Create `branch` off the repo's current HEAD and add a worktree at
 * `worktreePath`. Existing branch is attached; an existing worktree path errors.
 * -> invoke("git_worktree_add", { repo, branch, worktreePath })
 */
export function gitWorktreeAdd(
  repo: string,
  branch: string,
  worktreePath: string,
): Promise<void> {
  return invoke<void>("git_worktree_add", { repo, branch, worktreePath });
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
 * Open a GitHub PR for `branch` via `gh pr create` (cwd = repoPath), with the
 * body read from `bodyFilePath` (`--body-file`, safe for large markdown).
 * Resolves to the PR URL; if a PR already exists for the branch, resolves to the
 * existing PR's URL. Never touches `main`.
 * -> invoke("gh_pr_create", { repoPath, branch, title, bodyFilePath })
 */
export function ghPrCreate(
  repoPath: string,
  branch: string,
  title: string,
  bodyFilePath: string,
): Promise<string> {
  return invoke<string>("gh_pr_create", {
    repoPath,
    branch,
    title,
    bodyFilePath,
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
