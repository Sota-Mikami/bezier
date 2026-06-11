"use client";

// v0.5 slice 2.5 — worktree dev-server lifecycle (the "Design" tab preview).
//
// Owns a single dev-server pty for an issue's worktree, decoupled from rendering
// so it survives the Preview⇆Diff sub-toggle and can be torn down imperatively
// on Discard. Lives in the parent (ImplementPanel) so its unmount cleanup fires
// when the user leaves the Design view / issue.
//
// Flow: start() spawns `/bin/sh -c "<devCommand>"` in the worktree via the v0.2
// pty, accumulates its log, then polls `http_ping` until the server responds
// (-> "ready", iframe renders) or times out / the process exits (-> "error").
// stop() detaches listeners BEFORE killing so the expected exit is not reported
// as a crash.

import * as React from "react";

import {
  ptySpawn,
  ptyKill,
  onPtyData,
  onPtyExit,
  type UnlistenFn,
} from "@/lib/pty";
import {
  readPreviewConfig,
  writePreviewConfig,
  detectDev,
  detectRunner,
  defaultPort,
  tauriDevPort,
  buildDevCommand,
  buildTauriDevCommand,
  previewUrl,
  httpPing,
  packageCwd,
  ensureWorktreeNodeModules,
  ensureWorktreeTauriTarget,
  type PreviewConfig,
  type Framework,
  type DevDetect,
  type RunnerKind,
} from "@/lib/preview";

export type PreviewStatus = "idle" | "starting" | "ready" | "error" | "stopped";

const LOG_CAP = 20_000;
const POLL_MS = 800;
const READY_TIMEOUT_MS = 90_000;

// Strip ANSI escape sequences (color + cursor control like `\x1b[32m`, `\x1b[0K`)
// from dev-server / Rust-build output. The log pane renders plain text, so raw
// escapes would otherwise show as garbage (`⌐[1m…`). Matches CSI sequences.
const ANSI_RE = /\x1b\[[0-9;?]*[ -\/]*[@-~]/g;
function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

export interface PreviewServer {
  status: PreviewStatus;
  /**
   * Which runner this worktree uses: "web" (dev server -> iframe) or "tauri"
   * (launch a real Tauri dev window — no iframe). Drives the Design pane UI.
   */
  runner: RunnerKind;
  /** For the tauri runner: the dev port the worktree window is launched on. */
  tauriPort: number | null;
  /** Resolved config (saved, or detected default). Null until loaded. */
  config: PreviewConfig | null;
  /** package.json-derived framework hint (fallback for the port flag). */
  framework: Framework;
  /** package.json `scripts.dev`, surfaced in the settings UI. */
  scriptsDev: string | null;
  /** Accumulated dev-server output (tail, capped). */
  log: string;
  /** Human-readable failure reason when status === "error". */
  error: string | null;
  /** The iframe target once ready, else null. */
  url: string | null;
  /** False until config + detection have resolved. */
  configLoaded: boolean;
  /** Persist a new config (and adopt it for the next start). */
  saveConfig: (cfg: PreviewConfig) => Promise<void>;
  /** Start (or restart) the dev server; pass a config to override the saved one. */
  start: (override?: PreviewConfig) => Promise<void>;
  /** Kill the dev server and detach listeners. Safe to call repeatedly. */
  stop: () => Promise<void>;
}

export function usePreviewServer(
  root: string,
  worktreePath: string | null,
): PreviewServer {
  const [status, setStatus] = React.useState<PreviewStatus>("idle");
  const [runner, setRunner] = React.useState<RunnerKind>("web");
  const [tauriPort, setTauriPort] = React.useState<number | null>(null);
  const [config, setConfig] = React.useState<PreviewConfig | null>(null);
  const [framework, setFramework] = React.useState<Framework>(null);
  const [scriptsDev, setScriptsDev] = React.useState<string | null>(null);
  const [log, setLog] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [url, setUrl] = React.useState<string | null>(null);
  const [configLoaded, setConfigLoaded] = React.useState(false);

  const ptyIdRef = React.useRef<string | null>(null);
  const pollRef = React.useRef<number | null>(null);
  const unlistenRef = React.useRef<UnlistenFn[]>([]);
  // Detected runner + (for tauri) the worktree-relative Tauri crate dir, read in
  // start(). Kept in a ref so start()'s identity doesn't churn on detection.
  const runnerRef = React.useRef<RunnerKind>("web");
  const srcTauriRelRef = React.useRef<string | null>(null);

  // Load saved config + detect package.json defaults when a worktree appears.
  // setState only ever runs in the async continuation (no synchronous effect
  // setState).
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!worktreePath) {
        if (!cancelled) setConfigLoaded(true);
        return;
      }
      const [saved, detect] = await Promise.all([
        readPreviewConfig(root).catch(() => null),
        detectDev(worktreePath).catch(
          () =>
            ({ scriptsDev: null, framework: null, packageDir: "" }) as DevDetect,
        ),
      ]);
      if (cancelled) return;
      setScriptsDev(detect.scriptsDev);
      setFramework(detect.framework);

      // Runner detection (slice 2.7): web (iframe) vs tauri (real dev window).
      // A saved `runner` field overrides detection. Runs after detectDev because
      // it needs the resolved packageDir to find <packageDir>/src-tauri.
      const rd = await detectRunner(worktreePath, detect.packageDir).catch(() => ({
        runner: "web" as RunnerKind,
        srcTauriRel: null,
      }));
      if (cancelled) return;
      const resolvedRunner: RunnerKind = saved?.runner ?? rd.runner;
      runnerRef.current = resolvedRunner;
      srcTauriRelRef.current = rd.srcTauriRel;
      setRunner(resolvedRunner);
      setTauriPort(resolvedRunner === "tauri" ? tauriDevPort(root) : null);
      // Auto-config from package.json detection; a saved config overrides
      // per-field, but EACH empty field falls back to detection. So a stale
      // config (e.g. `{devCommand:"",...}` written before detection existed) or a
      // repo whose web app lives in a subdir (`app/`) still auto-resolves — the
      // user almost never has to fill the form by hand.
      const detected: PreviewConfig = {
        devCommand: detect.scriptsDev ? "npm run dev" : "",
        port: defaultPort(root),
        packageDir: detect.packageDir,
      };
      setConfig(
        saved
          ? {
              devCommand: saved.devCommand.trim() || detected.devCommand,
              port: saved.port || detected.port,
              packageDir: saved.packageDir || detected.packageDir,
            }
          : detected,
      );
      setConfigLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [root, worktreePath]);

  const clearTimers = React.useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const detachListeners = React.useCallback(() => {
    for (const un of unlistenRef.current.splice(0)) {
      try {
        un();
      } catch {
        /* already detached */
      }
    }
  }, []);

  const stop = React.useCallback(async () => {
    clearTimers();
    // Detach BEFORE killing so the resulting exit is not flagged as a crash.
    detachListeners();
    const id = ptyIdRef.current;
    ptyIdRef.current = null;
    if (id) {
      await ptyKill(id).catch(() => {
        /* child may already be gone */
      });
    }
    setUrl(null);
    setStatus((s) => (s === "idle" ? "idle" : "stopped"));
  }, [clearTimers, detachListeners]);

  const start = React.useCallback(
    async (override?: PreviewConfig) => {
      if (!worktreePath) return;
      const cfg = override ?? config;
      const isTauri = runnerRef.current === "tauri";
      // The web runner needs a dev command; the tauri runner builds its own
      // (`npm run tauri dev …`), so it doesn't.
      if (!cfg || (!isTauri && !cfg.devCommand.trim())) {
        setStatus("error");
        setError(
          "dev コマンドが未設定です。設定欄でコマンドを入力して保存してください。",
        );
        return;
      }

      // Tear down any prior server first (detach so its exit is ignored).
      clearTimers();
      detachListeners();
      const prev = ptyIdRef.current;
      ptyIdRef.current = null;
      if (prev) await ptyKill(prev).catch(() => {});

      setLog("");
      setError(null);
      setUrl(null);
      setStatus("starting");

      // A fresh worktree has no node_modules (gitignored) — clone it from the
      // main repo before launching, else `npm run dev` fails on missing deps.
      try {
        await ensureWorktreeNodeModules(root, worktreePath, cfg.packageDir);
      } catch (e) {
        setStatus("error");
        setError(
          `${e instanceof Error ? e.message : String(e)} — node_modules を用意できなかったため dev server を起動できません。`,
        );
        return;
      }

      // The tauri runner ALSO clones the Rust build cache (src-tauri/target) so
      // `tauri dev` builds incrementally, and launches on a dedicated port via a
      // --config override (the worktree's window, distinct from the main app).
      let command: string;
      let launchPort: number;
      if (isTauri) {
        const rel = srcTauriRelRef.current;
        if (rel) {
          const res = await ensureWorktreeTauriTarget(root, worktreePath, rel);
          if (!res.cloned && res.note) {
            setLog((l) => `${l}[continuum] ${res.note}\n`);
          }
        }
        launchPort = tauriDevPort(root);
        setTauriPort(launchPort);
        command = buildTauriDevCommand(launchPort);
      } else {
        launchPort = cfg.port;
        command = buildDevCommand(cfg, framework);
      }

      // Run in the package dir (root or a subdir like "app") — where package.json
      // (the dev / tauri scripts) and, for tauri, src-tauri live.
      const cwd = packageCwd(worktreePath, cfg.packageDir);
      let id: string;
      try {
        id = await ptySpawn({
          cwd,
          cmd: "/bin/sh",
          args: ["-c", command],
          cols: 120,
          rows: 40,
        });
      } catch (e) {
        setStatus("error");
        setError(e instanceof Error ? e.message : String(e));
        return;
      }
      ptyIdRef.current = id;

      unlistenRef.current.push(
        await onPtyData((p) => {
          if (p.id !== id) return;
          setLog((l) => {
            const next = l + stripAnsi(p.chunk);
            return next.length > LOG_CAP ? next.slice(next.length - LOG_CAP) : next;
          });
        }),
      );
      unlistenRef.current.push(
        await onPtyExit((p) => {
          if (p.id !== id || ptyIdRef.current !== id) return;
          clearTimers();
          ptyIdRef.current = null;
          setStatus((s) => (s === "ready" ? "stopped" : "error"));
          setError(
            "dev server プロセスが終了しました。下のログを確認してください。",
          );
        }),
      );

      // Both runners poll the dev-server port. web -> point the iframe at it once
      // it responds. tauri -> the inner Next dev server (beforeDevCommand) is up,
      // so the Tauri window is now compiling/opening; flag "ready" (running) and
      // never set an iframe url (PreviewPane renders the tauri view instead). The
      // first Rust build keeps streaming into the log after this.
      const target = previewUrl(launchPort);
      const deadline = Date.now() + READY_TIMEOUT_MS;
      pollRef.current = window.setInterval(() => {
        // Superseded by a newer start / a stop -> abandon this poll.
        if (ptyIdRef.current !== id) {
          clearTimers();
          return;
        }
        void httpPing(target)
          .catch(() => false)
          .then((up) => {
            if (ptyIdRef.current !== id) return;
            if (up) {
              clearTimers();
              if (!isTauri) setUrl(target);
              setStatus("ready");
            } else if (Date.now() > deadline) {
              clearTimers();
              setStatus("error");
              setError(
                `${Math.round(
                  READY_TIMEOUT_MS / 1000,
                )} 秒以内に ${target} が応答しませんでした。dev コマンドとポートを確認してください。`,
              );
            }
          });
      }, POLL_MS);
    },
    [root, worktreePath, config, framework, clearTimers, detachListeners],
  );

  const saveConfig = React.useCallback(
    async (cfg: PreviewConfig) => {
      setConfig(cfg);
      await writePreviewConfig(root, cfg);
    },
    [root],
  );

  // Cleanup on unmount: kill the dev server + detach listeners. The listener
  // array is mutated in place (never reassigned), so capturing it here is the
  // same object used by start()/stop() throughout the component's life.
  React.useEffect(() => {
    const listeners = unlistenRef.current;
    return () => {
      if (pollRef.current !== null) window.clearInterval(pollRef.current);
      for (const un of listeners.splice(0)) {
        try {
          un();
        } catch {
          /* already detached */
        }
      }
      const id = ptyIdRef.current;
      ptyIdRef.current = null;
      if (id) ptyKill(id).catch(() => {});
    };
  }, []);

  return {
    status,
    runner,
    tauriPort,
    config,
    framework,
    scriptsDev,
    log,
    error,
    url,
    configLoaded,
    saveConfig,
    start,
    stop,
  };
}
