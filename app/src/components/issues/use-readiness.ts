"use client";

// Repo readiness controller (DEC-111, Phase 1). Probes the repo for the common
// "cloned but not set up" snags and runs the bounded one-click fixes, streaming
// their output to a shared log. Each fix is a throwaway pty (install Node /
// install deps) or a file copy (.env). NEVER auto-runs anything; the UI drives.

import * as React from "react";

import { ptySpawn, onPtyData, onPtyExit, type UnlistenFn } from "@/lib/pty";
import { openInEditor } from "@/lib/ipc";
import {
  packageCwd,
  nvmInstallLaunch,
  depsInstallLaunch,
} from "@/lib/preview";
import {
  probeReadiness,
  copyEnvTemplate,
  invalidateNvmCache,
  type ReadinessItem,
  type ReadinessId,
} from "@/lib/readiness";

const ANSI_RE = /\x1b\[[0-9;?]*[ -\/]*[@-~]/g;
const LOG_CAP = 20_000;

export interface ReadinessController {
  items: ReadinessItem[];
  /** True once the first probe finished. */
  loaded: boolean;
  /** No item needs attention (so the dev server can be Run). */
  ready: boolean;
  /** Which fix is running (or "all"), else null. */
  busy: ReadinessId | "all" | null;
  log: string;
  reprobe: () => Promise<void>;
  fix: (id: ReadinessId) => Promise<boolean>;
  fixAll: () => Promise<void>;
}

export function useReadiness(
  root: string,
  packageDir: string,
): ReadinessController {
  const [items, setItems] = React.useState<ReadinessItem[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [busy, setBusy] = React.useState<ReadinessId | "all" | null>(null);
  const [log, setLog] = React.useState("");
  const unlistenRef = React.useRef<UnlistenFn[]>([]);
  // Mirror `busy` into a ref so the focus listener can skip re-probing mid-fix
  // without re-subscribing on every busy change.
  const busyRef = React.useRef(busy);
  React.useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  const appendLog = React.useCallback((s: string) => {
    setLog((l) => {
      const next = l + s;
      return next.length > LOG_CAP ? next.slice(next.length - LOG_CAP) : next;
    });
  }, []);

  // Re-read the repo's state (after an in-app fix, on window focus, or the manual
  // "re-check" button). Drops the nvm memo first so a Node installed OUTSIDE
  // Bezier (e.g. in a terminal) is reflected immediately — the filesystem checks
  // (node_modules / .env) are already live.
  const reprobe = React.useCallback(async () => {
    invalidateNvmCache();
    const next = await probeReadiness(root, packageDir).catch(() => [] as ReadinessItem[]);
    setItems(next);
    setLoaded(true);
  }, [root, packageDir]);

  // Initial / dependency-driven probe. `loaded` starts false (initial spinner)
  // and only ever flips true; a rare dependency change updates the checklist in
  // place. setState only runs in the async continuation (no synchronous effect
  // setState), guarded by `cancelled`.
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = await probeReadiness(root, packageDir).catch(() => [] as ReadinessItem[]);
      if (cancelled) return;
      setItems(next);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [root, packageDir]);

  // Re-read when the window regains focus / becomes visible — so coming back from
  // a terminal where the maker just installed deps or Node clears stale blockers
  // without a manual step. Throttled, and skipped while a fix is running.
  React.useEffect(() => {
    const last = { t: 0 };
    const onFocus = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (busyRef.current) return;
      const now = Date.now();
      if (now - last.t < 1500) return; // bursty focus events fire repeatedly
      last.t = now;
      void reprobe();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [reprobe]);

  // Run a fix in a throwaway pty, streaming to the log; resolves with the exit
  // code (1 on spawn failure).
  const runPty = React.useCallback(
    (launch: { cmd: string; args: string[] }, cwd: string, label: string): Promise<number> =>
      new Promise((resolve) => {
        appendLog(`\n[Bezier] ${label} …\n`);
        void (async () => {
          let id: string;
          try {
            id = await ptySpawn({ cwd, cmd: launch.cmd, args: launch.args, cols: 120, rows: 40 });
          } catch (e) {
            appendLog(`\n[Bezier] ${label} failed: ${e instanceof Error ? e.message : String(e)}\n`);
            resolve(1);
            return;
          }
          const off1 = await onPtyData((p) => {
            if (p.id === id) appendLog(p.chunk.replace(ANSI_RE, ""));
          });
          const off2 = await onPtyExit((p) => {
            if (p.id !== id) return;
            off1();
            off2();
            unlistenRef.current = unlistenRef.current.filter((f) => f !== off1 && f !== off2);
            appendLog(`\n[Bezier] ${label} ${p.code === 0 ? "done." : `exited (${p.code}).`}\n`);
            resolve(p.code ?? 1);
          });
          unlistenRef.current.push(off1, off2);
        })();
      }),
    [appendLog],
  );

  // Run a single fix. Returns whether it (probably) succeeded.
  const runFix = React.useCallback(
    async (id: ReadinessId): Promise<boolean> => {
      const dir = packageCwd(root, packageDir);
      if (id === "node") {
        const item = items.find((i) => i.id === "node");
        if (!item?.nodeVersion || item.nvmMissing) return false; // can't auto-install
        const code = await runPty(nvmInstallLaunch(item.nodeVersion), dir, `nvm install ${item.nodeVersion}`);
        if (code === 0) invalidateNvmCache(); // the new version must show on reprobe
        return code === 0;
      }
      if (id === "deps") {
        const { cwd, displayCmd, launch } = await depsInstallLaunch(root, packageDir);
        const code = await runPty(launch, cwd, displayCmd);
        return code === 0;
      }
      // env: copy the template + open it (the maker fills the values themselves).
      const item = items.find((i) => i.id === "env");
      if (!item?.envTemplate) return false;
      try {
        const path = await copyEnvTemplate(dir, item.envTemplate);
        appendLog(`\n[Bezier] ${item.envTemplate} → .env をコピーしました（秘密値は自分で入れてください）\n`);
        await openInEditor(path).catch(() => {});
        return true;
      } catch (e) {
        appendLog(`\n[Bezier] .env copy failed: ${e instanceof Error ? e.message : String(e)}\n`);
        return false;
      }
    },
    [root, packageDir, items, runPty, appendLog],
  );

  const fix = React.useCallback(
    async (id: ReadinessId): Promise<boolean> => {
      if (busy) return false;
      setBusy(id);
      try {
        const ok = await runFix(id);
        await reprobe();
        return ok;
      } finally {
        setBusy(null);
      }
    },
    [busy, runFix, reprobe],
  );

  // Fix everything that needs it, IN ORDER (Node → deps → env) — Node first so
  // deps install under the right runtime.
  const fixAll = React.useCallback(async () => {
    if (busy) return;
    setBusy("all");
    try {
      const order: ReadinessId[] = ["node", "deps", "env"];
      for (const id of order) {
        if (items.some((i) => i.id === id && i.status === "needs")) {
          const item = items.find((i) => i.id === id);
          if (id === "node" && item?.nvmMissing) continue; // can't auto-install
          await runFix(id);
        }
      }
      await reprobe();
    } finally {
      setBusy(null);
    }
  }, [busy, items, runFix, reprobe]);

  React.useEffect(() => {
    const listeners = unlistenRef.current;
    return () => {
      for (const un of listeners.splice(0)) {
        try {
          un();
        } catch {
          /* already detached */
        }
      }
    };
  }, []);

  const ready = items.every((i) => i.status === "ok");
  return { items, loaded, ready, busy, log, reprobe, fix, fixAll };
}
