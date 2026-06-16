"use client";

// Repo freshness (DEC-111 Phase 2). Detects when the repo's default branch has
// fallen behind origin and drives a SAFE fast-forward-only one-click update.
// NON-BLOCKING: this never gates running the app — it only powers a banner.

import * as React from "react";

import {
  gitFetch,
  gitDefaultBehind,
  gitUpdateDefault,
  type DefaultBehind,
  type UpdateResult,
} from "@/lib/git";

export interface RepoFreshness {
  base: string;
  behind: number;
  ahead: number;
  hasRemote: boolean;
  /** Local branch has its own commits → a fast-forward is impossible. */
  diverged: boolean;
  dirty: boolean;
  /** True once the first check finished. */
  loaded: boolean;
  busy: null | "checking" | "updating";
  /** Outcome of the last update attempt (for blocked/up-to-date messaging). */
  lastUpdate: UpdateResult | null;
  /** Error string when the last update threw. */
  updateError: string | null;
  refresh: () => Promise<void>;
  update: () => Promise<void>;
}

export function useRepoFreshness(root: string): RepoFreshness {
  const [snap, setSnap] = React.useState<DefaultBehind | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [busy, setBusy] = React.useState<null | "checking" | "updating">(null);
  const [lastUpdate, setLastUpdate] = React.useState<UpdateResult | null>(null);
  const [updateError, setUpdateError] = React.useState<string | null>(null);

  // Mount / root-change: best-effort fetch then snapshot. cancelled-guard so a
  // slow fetch never writes stale state into the wrong repo; setState only in the
  // async continuation (no synchronous effect setState).
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      await gitFetch(root).catch(() => false);
      const s = await gitDefaultBehind(root).catch(() => null);
      if (cancelled) return;
      setSnap(s);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [root]);

  const refresh = React.useCallback(async () => {
    if (busy) return;
    setBusy("checking");
    try {
      await gitFetch(root).catch(() => false);
      setSnap(await gitDefaultBehind(root).catch(() => null));
    } finally {
      setBusy(null);
    }
  }, [root, busy]);

  const update = React.useCallback(async () => {
    if (busy) return;
    setBusy("updating");
    setUpdateError(null);
    try {
      const r = await gitUpdateDefault(root);
      setLastUpdate(r);
      // Re-snapshot so a successful ff clears the banner (behind → 0).
      await gitFetch(root).catch(() => false);
      setSnap(await gitDefaultBehind(root).catch(() => null));
    } catch (e) {
      setUpdateError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, [root, busy]);

  return {
    base: snap?.base ?? "",
    behind: snap?.behind ?? 0,
    ahead: snap?.ahead ?? 0,
    hasRemote: snap?.hasRemote ?? false,
    diverged: (snap?.ahead ?? 0) > 0,
    dirty: snap?.dirty ?? false,
    loaded,
    busy,
    lastUpdate,
    updateError,
    refresh,
    update,
  };
}
