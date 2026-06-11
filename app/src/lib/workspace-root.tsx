"use client";

// Shared workspace-root state. The app needs one opened folder (the repo) that
// the Repo workspace, Issues, and Decisions all operate on. The provider lives
// in the root layout, so the root survives client-side navigation between
// routes; it is also persisted to localStorage so a reload restores it.
//
// It also keeps a list of RECENT repos with a usage count + a monotonic open
// sequence (recency) — an Obsidian-style "vault switcher": the sidebar shows the
// current repo name and up/down arrows cycle through the frequency-ordered list.
// (A monotonic seq is used instead of a wall-clock so the store stays
// deterministic and avoids Date.now.)
//
// Backed by a module-level store read via useSyncExternalStore — the SSR-safe
// way to surface a localStorage value: the server snapshot is null/empty, the
// client snapshot is the persisted value, and React reconciles after hydration
// without a setState-in-effect.

import * as React from "react";
import { openFolder } from "@/lib/workspace";

const STORAGE_KEY = "continuum:workspace-root";
const RECENTS_KEY = "continuum:recent-repos";

export interface RepoEntry {
  /** Absolute path of the repo folder. */
  path: string;
  /** How many times it has been opened/switched to (frequency). */
  count: number;
  /** Monotonic open sequence — higher = more recently used (recency tiebreak). */
  seq: number;
}

/** Last path segment — the repo's display name. */
export function repoName(path: string): string {
  const parts = path.replace(/\/+$/, "").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

// --- module store ---------------------------------------------------------

let currentRoot: string | null =
  typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;

function loadRecents(): RepoEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is RepoEntry =>
          !!e &&
          typeof (e as RepoEntry).path === "string" &&
          typeof (e as RepoEntry).count === "number" &&
          typeof (e as RepoEntry).seq === "number",
      )
      .map((e) => ({ path: e.path, count: e.count, seq: e.seq }));
  } catch {
    return [];
  }
}

// Internal unsorted map (by path) + a cached sorted snapshot (stable reference
// so useSyncExternalStore doesn't loop). Sort = count desc, then seq desc.
const recentsMap = new Map<string, RepoEntry>(
  loadRecents().map((e) => [e.path, e]),
);
let seqCounter = Math.max(0, ...[...recentsMap.values()].map((e) => e.seq));
// Ensure the persisted current root is represented (count >=1) on first load.
if (currentRoot && !recentsMap.has(currentRoot)) {
  recentsMap.set(currentRoot, { path: currentRoot, count: 1, seq: ++seqCounter });
}

const EMPTY: readonly RepoEntry[] = [];
let recentsSorted: RepoEntry[] = sortRecents();

function sortRecents(): RepoEntry[] {
  return [...recentsMap.values()].sort(
    (a, b) => b.count - a.count || b.seq - a.seq,
  );
}

const listeners = new Set<() => void>();
function notify(): void {
  for (const l of listeners) l();
}
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function persistRecents(): void {
  try {
    window.localStorage.setItem(
      RECENTS_KEY,
      JSON.stringify([...recentsMap.values()]),
    );
  } catch {
    /* localStorage unavailable — keep in-memory */
  }
}

function recordOpen(path: string): void {
  const existing = recentsMap.get(path);
  if (existing) {
    existing.count += 1;
    existing.seq = ++seqCounter;
  } else {
    recentsMap.set(path, { path, count: 1, seq: ++seqCounter });
  }
  recentsSorted = sortRecents();
  persistRecents();
}

function setRootValue(v: string | null): void {
  currentRoot = v;
  try {
    if (v) window.localStorage.setItem(STORAGE_KEY, v);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* localStorage unavailable */
  }
  if (v) recordOpen(v);
  notify();
}

// snapshots
function getRootSnapshot(): string | null {
  return currentRoot;
}
function getNullSnapshot(): null {
  return null;
}
function getRecentsSnapshot(): readonly RepoEntry[] {
  return recentsSorted;
}
function getEmptyRecents(): readonly RepoEntry[] {
  return EMPTY;
}
function getTrue(): boolean {
  return true;
}
function getFalse(): boolean {
  return false;
}

interface WorkspaceRootValue {
  /** Absolute path of the opened folder, or null when none is open. */
  root: string | null;
  /** Display name (last path segment) of the current repo, or null. */
  rootName: string | null;
  /** Recent repos, sorted by frequency (count desc, recency tiebreak). */
  recents: readonly RepoEntry[];
  /** True once the persisted value has been read (avoids a "no folder" flash). */
  hydrated: boolean;
  /** Open the native folder picker; sets + persists the root. Returns the picked path. */
  openRoot: () => Promise<string | null>;
  /** Switch the active repo to an already-known path (also bumps its recency). */
  switchTo: (path: string) => void;
  /** Cycle to the previous (dir -1) / next (dir +1) repo in the frequency order. */
  cycle: (dir: 1 | -1) => void;
}

const Ctx = React.createContext<WorkspaceRootValue | null>(null);

export function WorkspaceRootProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const root = React.useSyncExternalStore(
    subscribe,
    getRootSnapshot,
    getNullSnapshot,
  );
  const recents = React.useSyncExternalStore(
    subscribe,
    getRecentsSnapshot,
    getEmptyRecents,
  );
  const hydrated = React.useSyncExternalStore(subscribe, getTrue, getFalse);

  const openRoot = React.useCallback(async () => {
    const picked = await openFolder();
    if (picked) setRootValue(picked);
    return picked;
  }, []);

  const switchTo = React.useCallback((path: string) => {
    setRootValue(path);
  }, []);

  const cycle = React.useCallback((dir: 1 | -1) => {
    const list = recentsSorted;
    if (list.length <= 1) return;
    const idx = list.findIndex((e) => e.path === currentRoot);
    const next = (idx + dir + list.length) % list.length;
    setRootValue(list[next].path);
  }, []);

  const value = React.useMemo<WorkspaceRootValue>(
    () => ({
      root,
      rootName: root ? repoName(root) : null,
      recents,
      hydrated,
      openRoot,
      switchTo,
      cycle,
    }),
    [root, recents, hydrated, openRoot, switchTo, cycle],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspaceRoot(): WorkspaceRootValue {
  const ctx = React.useContext(Ctx);
  if (!ctx) {
    throw new Error("useWorkspaceRoot must be used within <WorkspaceRootProvider>");
  }
  return ctx;
}
