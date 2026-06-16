"use client";

// Per-repo status cache for the sidebar badges (DEC-111 Phase 4). A tiny module
// store (useSyncExternalStore) keyed by repo path, populated two ways: the active
// repo's RepoLive publishes its readiness truth, and the sidebar probes every
// recent repo CHEAPLY (local fs + a no-network git read) on a slow loop. It NEVER
// fetches — "update available" reflects the last-known remote refs (refreshed for
// real when the repo becomes active, via Phase 2's background fetch).

import * as React from "react";

import {
  readPreviewConfig,
  detectDev,
  packageCwd,
  hasPackageJson,
  resolvePackageDir,
} from "@/lib/preview";
import { probeReadiness } from "@/lib/readiness";
import { gitBehindAhead } from "@/lib/git";

export interface RepoStatus {
  /** Readiness blockers present (node/deps/.env) — only for Node projects. */
  needsSetup: boolean;
  /** Upstream has commits the local default branch lacks (no-network read). */
  updateAvailable: boolean;
  /** Date.now() of the last probe (staleness guard for the sidebar loop). */
  checkedAt: number;
}

// --- module store ---------------------------------------------------------
const statuses = new Map<string, RepoStatus>();
let snapshot: ReadonlyMap<string, RepoStatus> = new Map();
const listeners = new Set<() => void>();

function notify(): void {
  snapshot = new Map(statuses);
  for (const l of listeners) l();
}
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Merge a patch into a repo's status; only NOTIFIES when a visible field
 *  (needsSetup / updateAvailable) actually changed — so probing N repos doesn't
 *  thrash the sidebar. A pure checkedAt bump updates the guard map silently. */
export function setRepoStatus(path: string, patch: Partial<RepoStatus>): void {
  const prev = statuses.get(path);
  const next: RepoStatus = {
    needsSetup: patch.needsSetup ?? prev?.needsSetup ?? false,
    updateAvailable: patch.updateAvailable ?? prev?.updateAvailable ?? false,
    checkedAt: patch.checkedAt ?? prev?.checkedAt ?? 0,
  };
  statuses.set(path, next);
  if (
    prev &&
    prev.needsSetup === next.needsSetup &&
    prev.updateAvailable === next.updateAvailable
  ) {
    return; // no visible change — guard map updated, no re-render
  }
  notify();
}

export function getRepoStatus(path: string): RepoStatus | undefined {
  return statuses.get(path);
}

const EMPTY: ReadonlyMap<string, RepoStatus> = new Map();

export function useRepoStatusMap(): ReadonlyMap<string, RepoStatus> {
  return React.useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => EMPTY,
  );
}

/** Cheap, NO-NETWORK probe of a repo's status; writes into the store. */
export async function probeRepoStatus(path: string): Promise<void> {
  // packageDir VALIDATED the same way the Live view resolves it (saved value only
  // when it really points at a package, else detection) — so the badge matches.
  const saved = await readPreviewConfig(path).catch(() => null);
  const detected = (await detectDev(path).catch(() => ({ packageDir: "" }))).packageDir;
  const packageDir = await resolvePackageDir(path, saved?.packageDir ?? "", detected);

  // Gate on "is this a Node project at all" — probeReadiness ALWAYS emits a deps
  // item, so without this gate every Go/Rust/static/docs repo would show ⚠️.
  const isNode =
    (await hasPackageJson(packageCwd(path, packageDir)).catch(() => false)) ||
    (await hasPackageJson(path).catch(() => false));

  const needsSetup = isNode
    ? (await probeReadiness(path, packageDir).catch(() => [])).some(
        (i) => i.status === "needs",
      )
    : false;

  // "@{upstream}" resolves the current branch's upstream with NO network; rejects
  // (→ false) on no remote / no tracking ref / detached HEAD.
  const updateAvailable = await gitBehindAhead(path, "@{upstream}")
    .then((r) => r.behind > 0)
    .catch(() => false);

  setRepoStatus(path, { needsSetup, updateAvailable, checkedAt: Date.now() });
}
