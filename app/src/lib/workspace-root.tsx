"use client";

// Shared workspace-root state. The app needs one opened folder (the repo) that
// the Repo workspace, Issues, and Decisions all operate on. The provider lives
// in the root layout, so the root survives client-side navigation between
// routes; it is also persisted to localStorage so a reload restores it.
//
// Backed by a module-level store read via useSyncExternalStore — the SSR-safe
// way to surface a localStorage value: the server snapshot is null, the client
// snapshot is the persisted value, and React reconciles after hydration without
// a setState-in-effect.

import * as React from "react";
import { openFolder } from "@/lib/workspace";

const STORAGE_KEY = "continuum:workspace-root";

// Initialized at module load. On the server (SSG prerender) window is undefined,
// so it starts null and is filled in on the client.
let currentRoot: string | null =
  typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;

const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
function getRootSnapshot(): string | null {
  return currentRoot;
}
function getNullSnapshot(): null {
  return null;
}
// `hydrated` flips from false (server) to true (client) after hydration.
function getTrue(): boolean {
  return true;
}
function getFalse(): boolean {
  return false;
}

function setRootValue(v: string | null): void {
  currentRoot = v;
  try {
    if (v) window.localStorage.setItem(STORAGE_KEY, v);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* localStorage unavailable — keep the in-memory value */
  }
  for (const l of listeners) l();
}

interface WorkspaceRootValue {
  /** Absolute path of the opened folder, or null when none is open. */
  root: string | null;
  /** True once the persisted value has been read (avoids a "no folder" flash). */
  hydrated: boolean;
  /** Open the native folder picker; sets + persists the root. Returns the picked path. */
  openRoot: () => Promise<string | null>;
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
  const hydrated = React.useSyncExternalStore(subscribe, getTrue, getFalse);

  const openRoot = React.useCallback(async () => {
    const picked = await openFolder();
    if (picked) setRootValue(picked);
    return picked;
  }, []);

  const value = React.useMemo<WorkspaceRootValue>(
    () => ({ root, hydrated, openRoot }),
    [root, hydrated, openRoot],
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
