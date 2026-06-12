// Cross-surface issue actions that need BOTH the issues data layer and git
// (so they can't live in issues.ts, which is intentionally git-decoupled).
// Shared by the sidebar navigator and the issue detail.

import { removeTrashEntry, type TrashMeta } from "@/lib/issues";
import { gitWorktreeRemove, gitBranchDelete } from "@/lib/git";

/**
 * Permanently remove a TRASHED issue: tear down its git worktree/branch (kept
 * alive while trashed so restore is clean) then delete the trash folders. git
 * teardown is best-effort — a missing worktree/branch must not block removal.
 */
export async function purgeTrashed(root: string, meta: TrashMeta): Promise<void> {
  if (meta.worktreePath) {
    await gitWorktreeRemove(root, meta.worktreePath).catch(() => {});
  }
  if (meta.branch) {
    await gitBranchDelete(root, meta.branch).catch(() => {});
  }
  await removeTrashEntry(root, meta);
}
