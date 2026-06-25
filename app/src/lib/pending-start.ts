// Module-level registry for "auto-start" payloads set by the New-Issue modal
// (DEC-146). Bridges the navigation gap between the modal and the session mount.
//
// Flow:
//   1. Modal's Start button: createIssue() → setPendingStart(id, {message, base}) → router.push
//   2. use-implement-session mounts for the new issue: takePendingStart(id) →
//      set chosenBase, then fire handleStart(message) once the session is ready.
//
// Entries are consumed at most once (take removes the entry). If navigation never
// lands (app closed, etc.) the stale entry is GC'd with the module.

export interface PendingStart {
  message: string;
  base: string;
}

const registry = new Map<string, PendingStart>();

export function setPendingStart(issueId: string, payload: PendingStart): void {
  registry.set(issueId, payload);
}

/**
 * Consume and return the pending-start payload for `issueId`, or null if none.
 * Consuming removes the entry — fires at most once per issue.
 */
export function takePendingStart(issueId: string): PendingStart | null {
  const payload = registry.get(issueId);
  if (payload !== undefined) registry.delete(issueId);
  return payload ?? null;
}
