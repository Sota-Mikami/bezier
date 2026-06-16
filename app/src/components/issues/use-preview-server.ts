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
  ptyKillKey,
  ptyLookup,
  ptyBacklog,
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
  findFreePort,
  packageCwd,
  hasPackageJson,
  repoNodeVersion,
  withRepoNode,
  ensureWorktreeNodeModules,
  ensureWorktreeTauriTarget,
  depsInstallLaunch,
  detectInstall,
  installCommand,
  type PreviewConfig,
  type Framework,
  type DevDetect,
  type RunnerKind,
} from "@/lib/preview";
import { getSettings } from "@/lib/settings";
import { tt } from "@/lib/i18n";

export type PreviewStatus = "idle" | "starting" | "ready" | "error" | "stopped";

const LOG_CAP = 20_000;
const POLL_MS = 800;
const READY_TIMEOUT_MS = 90_000;

// --- Persistent preview registry (DEC-040) ---------------------------------
// Preview dev servers now SURVIVE leaving an issue (like the agent pty, DEC-026)
// so returning reattaches instead of restarting. Safety rails: a free port per
// preview (no collisions), a concurrency CAP (evict the least-recently-viewed),
// and an idle sweep (stop previews not viewed for a while). The pty is keyed
// `preview:<previewKey>`; this module-level map tracks each running preview's
// port + last-viewed time. It lives as long as the app runs — and previews die
// with the app (SIGHUP on the pty), so a fresh launch starts clean.

const PREVIEW_PTY_PREFIX = "preview:";
// Concurrency cap + idle-stop are user-configurable (DEC-043). Read live from
// settings so changing them takes effect without a restart.
const maxPreviews = () => getSettings().maxPreviews;
const idleStopMs = () => getSettings().previewIdleMinutes * 60_000;
const SWEEP_MS = 60_000;

interface PreviewEntry {
  port: number;
  isTauri: boolean;
  lastViewedAt: number;
}

const previewRegistry = new Map<string, PreviewEntry>();

function previewPtyKey(key: string): string {
  return `${PREVIEW_PTY_PREFIX}${key}`;
}

/** Issue ids whose preview dev-server is currently running — for the sidebar's
 * "live preview" indicator (the N-max rule means knowing what's up matters).
 * Module-level + shared, so a poll reads it live. */
export function runningPreviewKeys(): string[] {
  return [...previewRegistry.keys()];
}

/** Mark a preview as viewed (keeps it out of the idle sweep). */
function touchPreview(key: string): void {
  const e = previewRegistry.get(key);
  if (e) e.lastViewedAt = Date.now();
}

/** Stop + forget a preview (kills its keyed pty). */
async function dropPreview(key: string): Promise<void> {
  previewRegistry.delete(key);
  await ptyKillKey(previewPtyKey(key)).catch(() => {});
}

/** Enforce the concurrency cap before starting `keepKey`: evict the
 * least-recently-viewed OTHER preview while at/over the limit. */
async function enforcePreviewCap(keepKey: string): Promise<void> {
  while (previewRegistry.size >= maxPreviews() && !previewRegistry.has(keepKey)) {
    let lruKey: string | null = null;
    let lruAt = Infinity;
    for (const [k, e] of previewRegistry) {
      if (k === keepKey) continue;
      if (e.lastViewedAt < lruAt) {
        lruAt = e.lastViewedAt;
        lruKey = k;
      }
    }
    if (!lruKey) break;
    await dropPreview(lruKey);
  }
}

// Idle sweep: started once, runs for the app's lifetime. Stops previews not
// viewed for IDLE_STOP_MS. (Date.now is fine in the app runtime.)
let sweepStarted = false;
function ensureIdleSweep(): void {
  if (sweepStarted || typeof window === "undefined") return;
  sweepStarted = true;
  window.setInterval(() => {
    const now = Date.now();
    const idle = idleStopMs();
    for (const [k, e] of [...previewRegistry]) {
      if (now - e.lastViewedAt >= idle) void dropPreview(k);
    }
  }, SWEEP_MS);
}

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
  /** True while the install command is running. */
  installing: boolean;
  /**
   * The resolved install command for this repo (`npm install`, `pnpm install`,
   * …), detected from its lockfile. Null until detection resolves.
   */
  installCmd: string | null;
  /** Install deps with the detected manager (for repos without node_modules). */
  installDeps: () => Promise<void>;
}

export function usePreviewServer(
  root: string,
  worktreePath: string | null,
  previewKey: string,
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
  const [installing, setInstalling] = React.useState(false);
  const [installCmd, setInstallCmd] = React.useState<string | null>(null);

  const ptyIdRef = React.useRef<string | null>(null);
  const pollRef = React.useRef<number | null>(null);
  const unlistenRef = React.useRef<UnlistenFn[]>([]);
  // Detected runner + (for tauri) the worktree-relative Tauri crate dir, read in
  // start(). Kept in a ref so start()'s identity doesn't churn on detection.
  const runnerRef = React.useRef<RunnerKind>("web");
  const srcTauriRelRef = React.useRef<string | null>(null);

  // Persistent-preview key (DEC-040). The pty survives leaving the issue; this
  // key identifies it for reattach / cap / idle.
  const ptyKey = previewPtyKey(previewKey);

  // Keep this preview "viewed" while the issue is open (out of the idle sweep),
  // and run the sweep at least once.
  React.useEffect(() => {
    ensureIdleSweep();
    touchPreview(previewKey);
    const h = window.setInterval(() => touchPreview(previewKey), 30_000);
    return () => window.clearInterval(h);
  }, [previewKey]);

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
      const resolved: PreviewConfig = saved
        ? {
            devCommand: saved.devCommand.trim() || detected.devCommand,
            port: saved.port || detected.port,
            packageDir: saved.packageDir || detected.packageDir,
          }
        : detected;
      setConfig(resolved);
      setConfigLoaded(true);

      // Resolve the install command from the lockfile (npm/pnpm/yarn/bun), so
      // the "Install dependencies" button names the RIGHT manager + dir (DEC-109).
      const inst = await detectInstall(worktreePath, resolved.packageDir).catch(
        () => null,
      );
      if (cancelled) return;
      if (inst) setInstallCmd(installCommand(inst.manager));
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
    ptyIdRef.current = null;
    // Kill the PERSISTENT keyed pty + forget it (DEC-040). Used by the explicit
    // Stop button and by Discard.
    await dropPreview(previewKey);
    setUrl(null);
    setStatus((s) => (s === "idle" ? "idle" : "stopped"));
  }, [clearTimers, detachListeners, previewKey]);

  // Install deps for makers who haven't yet — the dev server can't start without
  // node_modules (DEC-109, the Live view's common first-run snag). The manager
  // (npm/pnpm/yarn/bun) and the dir to run in are detected from the lockfile, so
  // non-npm projects AND monorepos (lockfile hoisted above the package) both
  // work. Streams into `log`; flips `installing` until it exits. A throwaway pty
  // (no key), distinct from the dev server.
  const installDeps = React.useCallback(async () => {
    if (!worktreePath || installing) return;
    // Detect manager/dir + build a non-interactive, repo-Node spawn (shared with
    // the readiness checklist). Corepack prompt off so a pnpm repo doesn't
    // deadlock on the read-only Live log.
    const { cwd, displayCmd, launch } = await depsInstallLaunch(
      worktreePath,
      config?.packageDir ?? "",
    );
    setInstalling(true);
    setError(null);
    setLog((l) => `${l}\n[Bezier] ${displayCmd} …\n`);
    try {
      const id = await ptySpawn({
        cwd,
        cmd: launch.cmd,
        args: launch.args,
        cols: 120,
        rows: 40,
      });
      const offData = await onPtyData((p) => {
        if (p.id !== id) return;
        setLog((l) => {
          const next = l + stripAnsi(p.chunk);
          return next.length > LOG_CAP ? next.slice(next.length - LOG_CAP) : next;
        });
      });
      const offExit = await onPtyExit((p) => {
        if (p.id !== id) return;
        offData();
        offExit();
        setInstalling(false);
        setLog((l) => `${l}\n[Bezier] ${displayCmd} ${p.code === 0 ? "done." : `exited (${p.code}).`}\n`);
      });
    } catch (e) {
      setInstalling(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [worktreePath, installing, config]);

  const start = React.useCallback(
    async (override?: PreviewConfig) => {
      if (!worktreePath) return;
      const cfg = override ?? config;
      const isTauri = runnerRef.current === "tauri";
      // The web runner needs a dev command; the tauri runner builds its own
      // (`npm run tauri dev …`), so it doesn't.
      if (!cfg || (!isTauri && !cfg.devCommand.trim())) {
        setStatus("error");
        setError(tt("previewServer.devCommandUnset"));
        return;
      }

      // Tear down any prior server for this key first (detach so its exit is
      // ignored), then make room under the concurrency cap (DEC-040).
      clearTimers();
      detachListeners();
      ptyIdRef.current = null;
      await ptyKillKey(ptyKey).catch(() => {});
      previewRegistry.delete(previewKey);
      await enforcePreviewCap(previewKey);

      setLog("");
      setError(null);
      setUrl(null);
      setStatus("starting");

      // A free port per preview so concurrent dev servers never collide.
      const freePort = await findFreePort().catch(() => cfg.port);

      // A fresh worktree has no node_modules (gitignored) — clone it from the
      // main repo before launching, else `npm run dev` fails on missing deps.
      // The "live" repo-root preview (worktreePath === root, DEC-109) runs in the
      // user's REAL repo, which already has node_modules — never clone into itself
      // / mutate the real repo.
      const isLive = worktreePath === root;
      // Guard a mis-set package directory (e.g. a stale "app" for a repo whose
      // package.json is at the root) — otherwise the node_modules clone fails with
      // a confusing "run npm install in <dir>/node_modules" pointing at a dir that
      // doesn't exist. Tell the maker the real fix instead.
      if (cfg.packageDir && !(await hasPackageJson(packageCwd(root, cfg.packageDir)))) {
        setStatus("error");
        setError(tt("previewServer.packageDirMissing", { dir: cfg.packageDir }));
        return;
      }
      if (!isLive) {
        try {
          await ensureWorktreeNodeModules(root, worktreePath, cfg.packageDir);
        } catch (e) {
          setStatus("error");
          setError(
            tt("previewServer.nodeModulesFailed", { msg: e instanceof Error ? e.message : String(e) }),
          );
          return;
        }
      }

      // The tauri runner ALSO clones the Rust build cache (src-tauri/target) so
      // `tauri dev` builds incrementally, and launches on a dedicated port via a
      // --config override (the worktree's window, distinct from the main app).
      let command: string;
      const launchPort = freePort;
      if (isTauri) {
        const rel = srcTauriRelRef.current;
        if (rel && !isLive) {
          const res = await ensureWorktreeTauriTarget(root, worktreePath, rel);
          if (!res.cloned && res.note) {
            setLog((l) => `${l}[Bezier] ${res.note}\n`);
          }
        }
        setTauriPort(launchPort);
        command = buildTauriDevCommand(launchPort);
      } else {
        command = buildDevCommand({ ...cfg, port: launchPort }, framework);
      }

      // Run in the package dir (root or a subdir like "app") — where package.json
      // (the dev / tauri scripts) and, for tauri, src-tauri live. Launch under the
      // repo's pinned Node version (nvm/.nvmrc/engines), not the app's inherited
      // one — else a repo that requires e.g. Node 24 fails its engine check.
      const cwd = packageCwd(worktreePath, cfg.packageDir);
      const node = await repoNodeVersion(cwd).catch(() => null);
      const launch = withRepoNode(command, node);
      let id: string;
      try {
        id = await ptySpawn({
          cwd,
          cmd: launch.cmd,
          args: launch.args,
          cols: 120,
          rows: 40,
          key: ptyKey, // persistent: survives leaving the issue (DEC-040)
        });
      } catch (e) {
        setStatus("error");
        setError(e instanceof Error ? e.message : String(e));
        return;
      }
      ptyIdRef.current = id;
      // Track this running preview (port + viewed-time) for reattach / cap / idle.
      previewRegistry.set(previewKey, {
        port: launchPort,
        isTauri,
        lastViewedAt: Date.now(),
      });

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
          setError(tt("previewServer.processExited"));
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
                tt("previewServer.noResponse", {
                  sec: Math.round(READY_TIMEOUT_MS / 1000),
                  target,
                }),
              );
            }
          });
      }, POLL_MS);
    },
    [root, worktreePath, config, framework, clearTimers, detachListeners, ptyKey, previewKey],
  );

  const saveConfig = React.useCallback(
    async (cfg: PreviewConfig) => {
      setConfig(cfg);
      await writePreviewConfig(root, cfg);
    },
    [root],
  );

  // Cleanup on unmount: DETACH listeners + stop polling, but DO NOT kill the dev
  // server (DEC-040) — it persists (keyed pty) so returning to the issue
  // reattaches instead of restarting. It's stopped only by the idle sweep, the
  // concurrency cap, the explicit Stop button, or Discard. The listener array is
  // mutated in place (never reassigned), so capturing it here is the same object
  // used by start()/stop() throughout the component's life.
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
      ptyIdRef.current = null;
    };
  }, []);

  // Reattach on mount (DEC-040): if a preview is already RUNNING for this issue
  // (you left and came back), don't restart — find its pty, replay its log, poll
  // its known port, and show ready. Otherwise leave it to the user's Start.
  React.useEffect(() => {
    if (!worktreePath) return;
    const entry = previewRegistry.get(previewKey);
    if (!entry) return;
    let cancelled = false;
    const unlisteners = unlistenRef.current;
    (async () => {
      const id = await ptyLookup(ptyKey).catch(() => null);
      if (cancelled) return;
      if (!id) {
        // Registry stale (e.g. process died) — forget it.
        previewRegistry.delete(previewKey);
        return;
      }
      ptyIdRef.current = id;
      touchPreview(previewKey);
      const backlog = await ptyBacklog(id).catch(() => "");
      if (cancelled) return;
      if (backlog) setLog(stripAnsi(backlog).slice(-LOG_CAP));
      setError(null);
      setStatus("starting");
      // Re-attach output + exit listeners to the live pty.
      unlisteners.push(
        await onPtyData((p) => {
          if (p.id !== id) return;
          setLog((l) => {
            const next = l + stripAnsi(p.chunk);
            return next.length > LOG_CAP ? next.slice(next.length - LOG_CAP) : next;
          });
        }),
      );
      unlisteners.push(
        await onPtyExit((p) => {
          if (p.id !== id || ptyIdRef.current !== id) return;
          ptyIdRef.current = null;
          previewRegistry.delete(previewKey);
          setStatus((s) => (s === "ready" ? "stopped" : "error"));
        }),
      );
      // Poll the known port; it's already up, so this resolves fast.
      const target = previewUrl(entry.port);
      const tick = async () => {
        if (cancelled || ptyIdRef.current !== id) return;
        const up = await httpPing(target).catch(() => false);
        if (cancelled || ptyIdRef.current !== id) return;
        if (up) {
          if (pollRef.current !== null) window.clearInterval(pollRef.current);
          pollRef.current = null;
          if (!entry.isTauri) setUrl(target);
          if (entry.isTauri) setTauriPort(entry.port);
          setStatus("ready");
        }
      };
      void tick();
      pollRef.current = window.setInterval(() => void tick(), POLL_MS);
    })();
    return () => {
      cancelled = true;
    };
    // worktreePath + previewKey identify the issue; run once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worktreePath, previewKey]);

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
    installing,
    installCmd,
    installDeps,
  };
}
