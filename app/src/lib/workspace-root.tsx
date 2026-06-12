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
import { gitRepoStatus, gitInit } from "@/lib/git";
import { confirmDialog, messageDialog } from "@/lib/ipc";

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

/**
 * Resolve a picked folder to a usable repo root (DEC-035), guiding the user
 * through the subfolder / not-a-repo cases. Returns the path to open, or null if
 * the user cancelled. Falls back to the picked path if git status can't be read.
 */
async function ensureUsableRepo(picked: string): Promise<string | null> {
  const st = await gitRepoStatus(picked).catch(() => null);
  if (!st || !st.toplevel) {
    // git unavailable or status failed → only offer the not-a-repo path below if
    // we positively know it isn't a repo; otherwise open as-is.
    if (st && !st.isRepo) return offerInit(picked);
    return picked;
  }
  if (st.isRepo && st.isToplevel) return picked;
  if (st.isRepo && !st.isToplevel) {
    const ok = await confirmDialog(
      `このフォルダはリポジトリ「${repoName(st.toplevel)}」の一部（サブフォルダ）です。continuum はリポジトリ単位で動くため、リポジトリの root を開くことを推奨します。`,
      {
        title: "リポジトリの root を開く",
        okLabel: "root を開く",
        cancelLabel: "キャンセル",
      },
    );
    return ok ? st.toplevel : null;
  }
  return offerInit(picked);
}

async function offerInit(picked: string): Promise<string | null> {
  const ok = await confirmDialog(
    `このフォルダは git リポジトリではありません。continuum で使うには git リポジトリが必要です。今ここで git init し、現在のファイルで初回コミットを作成しますか？`,
    {
      title: "git リポジトリにする",
      okLabel: "git init して開く",
      cancelLabel: "キャンセル",
    },
  );
  if (!ok) return null;
  try {
    await gitInit(picked);
    return picked;
  } catch (e) {
    await messageDialog(
      `git init に失敗しました: ${e instanceof Error ? e.message : String(e)}`,
      { title: "エラー" },
    );
    return null;
  }
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

  // Open-folder guardrails (DEC-035 / OPEN-002). continuum works per git repo,
  // and worktrees are cut off the repo TOPLEVEL. So when you open a folder:
  //   - repo root         → use it
  //   - subfolder of a repo → opening it would make worktrees span the whole
  //     parent repo (and miss the subfolder if untracked); steer to the root
  //   - not a repo        → offer to `git init` it (so plain folders just work)
  const openRoot = React.useCallback(async () => {
    const picked = await openFolder();
    if (!picked) return null;
    const resolved = await ensureUsableRepo(picked);
    if (resolved) setRootValue(resolved);
    return resolved;
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
