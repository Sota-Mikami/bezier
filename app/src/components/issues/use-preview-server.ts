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
  detectApps,
  pickDefaultApp,
  detectRunner,
  defaultPort,
  tauriDevPort,
  buildDevCommand,
  buildTauriDevCommand,
  previewUrl,
  parseDevServerUrl,
  httpPing,
  httpFrameBlocked,
  readDeclaredPreviewUrl,
  discoverWorktreeUrls,
  findFreePort,
  packageCwd,
  hasPackageJson,
  resolvePackageDir,
  repoNodeVersion,
  withRepoNode,
  ensureWorktreeNodeModules,
  mirrorWorktreeEnv,
  ensureWorktreeTauriTarget,
  depsInstallLaunch,
  detectInstall,
  installCommand,
  type PreviewConfig,
  type Framework,
  type DevDetect,
  type DetectedApp,
  type RunnerKind,
} from "@/lib/preview";
import { getSettings } from "@/lib/settings";
import { tt } from "@/lib/i18n";

export type PreviewStatus = "idle" | "starting" | "ready" | "error" | "stopped";

const LOG_CAP = 20_000;
const POLL_MS = 800;
// Generous ceiling for heavy cold starts (first Next compile + codegen watchers,
// monorepo run-p). A dead process fails fast via the pty-exit handler, so this only
// bounds the still-compiling case.
const READY_TIMEOUT_MS = 150_000;

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
  /** The dir the dev server runs in (`packageCwd(worktree, packageDir)`) — used by
   *  the bottom-panel terminal so `claude`/commands run where the app lives (DEC-126).
   *  Null until a worktree + config exist. */
  cwd: string | null;
  /** Attach mode (DEC-129): pointing at a URL the maker serves themselves (Docker /
   *  Rails / etc.) instead of managing a dev-server process. */
  attach: boolean;
  /** Attach-first auto-detect (DEC-141 #5): we ADOPTED a dev server the agent/maker
   *  started (declared <issue.dir>/preview-url, or lsof worktree-scoped) — Bezier
   *  doesn't own the process, so there's nothing to "Stop", just like attach mode. */
  autoAttached: boolean;
  /** All runnable apps found in the repo — render a picker when length > 1 (DEC-125). */
  apps: DetectedApp[];
  /** Switch the active app (monorepo): persist its packageDir and restart if running. */
  selectApp: (packageDir: string) => Promise<void>;
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
  /** The ready app forbids iframe embedding (X-Frame-Options / CSP) → offer
   *  "open in browser" instead of a blank preview. */
  frameBlocked: boolean;
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
  /** Attach-first auto-detect (DEC-141 #5 ②a): the per-issue file the agent writes
   *  its dev-server URL to (`<issue.dir>/preview-url`). Issue previews pass it; Live
   *  passes null (auto-detect is scoped to issue worktrees — see the effect below). */
  declUrlFile?: string | null,
): PreviewServer {
  const [status, setStatus] = React.useState<PreviewStatus>("idle");
  const [runner, setRunner] = React.useState<RunnerKind>("web");
  const [tauriPort, setTauriPort] = React.useState<number | null>(null);
  const [config, setConfig] = React.useState<PreviewConfig | null>(null);
  // All runnable apps in the repo (DEC-125) — drives the app-picker when > 1.
  const [apps, setApps] = React.useState<DetectedApp[]>([]);
  const [framework, setFramework] = React.useState<Framework>(null);
  const [scriptsDev, setScriptsDev] = React.useState<string | null>(null);
  const [log, setLog] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  // The ready dev server forbids iframe embedding (X-Frame-Options / CSP) — show
  // an "open in browser" CTA instead of a blank preview.
  const [frameBlocked, setFrameBlocked] = React.useState(false);
  const [url, setUrl] = React.useState<string | null>(null);
  // Attach-first auto-detect (DEC-141 #5): true while we're showing a dev server the
  // agent/maker started (adopted), which Bezier doesn't own (no Stop, like attach).
  const [autoAttached, setAutoAttached] = React.useState(false);
  const [configLoaded, setConfigLoaded] = React.useState(false);
  const [installing, setInstalling] = React.useState(false);
  const [installCmd, setInstallCmd] = React.useState<string | null>(null);
  // PE P2-3 (DEC-130): the packageDir the RUNNING server actually launched in. The
  // terminal/cwd must follow THIS, not a config the maker edited (but didn't restart)
  // — else `docker compose up` / a shell would open in the wrong dir. null = nothing
  // running, so cwd falls back to the current config.
  const [runningPackageDir, setRunningPackageDir] = React.useState<string | null>(null);

  const ptyIdRef = React.useRef<string | null>(null);
  const pollRef = React.useRef<number | null>(null);
  const unlistenRef = React.useRef<UnlistenFn[]>([]);
  // The port the dev server ANNOUNCED in its output (stack-agnostic, overrides the
  // assumed/forced port). null until detected; reset per start(). `urlBufRef` is a
  // small rolling tail of stripped output so a URL split across chunks is caught.
  const detectedPortRef = React.useRef<number | null>(null);
  const urlBufRef = React.useRef("");
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
      const [saved, detectWt, appsWt] = await Promise.all([
        readPreviewConfig(root).catch(() => null),
        detectDev(worktreePath).catch(
          () =>
            ({ scriptName: null, scriptsDev: null, framework: null, packageDir: "" }) as DevDetect,
        ),
        detectApps(worktreePath).catch(() => [] as DetectedApp[]),
      ]);
      if (cancelled) return;
      // Robustness: an issue worktree can be mid-creation, cleaned, or on a
      // branch without the package — detection then finds no dev script and the
      // command "disappears" after a restart. The dev script is COMMITTED, so the
      // REAL repo root is a reliable fallback source (DEC-122). (Live runs with
      // worktreePath === root, so this only adds a fallback for issue worktrees.)
      let detect = detectWt;
      let apps = appsWt;
      if (!detect.scriptsDev && worktreePath !== root) {
        const rootDetect = await detectDev(root).catch(() => null);
        if (cancelled) return;
        if (rootDetect?.scriptsDev) detect = rootDetect;
      }
      if (apps.length === 0 && worktreePath !== root) {
        const rootApps = await detectApps(root).catch(() => [] as DetectedApp[]);
        if (cancelled) return;
        if (rootApps.length) apps = rootApps;
      }
      setApps(apps);

      // Choose the active app (DEC-125 / ideas-backlog §G): a valid SAVED packageDir
      // wins; otherwise the smart default (prefer .env.local / newer framework /
      // recency) — so a monorepo with several frontends runs the CURRENT one, not
      // the first hardcoded subdir match. `detect` is the legacy single-best
      // fallback for the rare case detectApps finds nothing.
      const savedDir = (saved?.packageDir ?? "").replace(/^\/+|\/+$/g, "");
      const chosen = apps.find((a) => a.packageDir === savedDir) ?? pickDefaultApp(apps);
      const chosenDir = chosen?.packageDir ?? detect.packageDir;

      setScriptsDev(chosen?.scriptsDev ?? detect.scriptsDev);
      setFramework(chosen?.framework ?? detect.framework);

      // Runner detection (slice 2.7): web (iframe) vs tauri (real dev window).
      // A saved `runner` field overrides detection. Runs after app selection
      // because it needs the chosen packageDir to find <packageDir>/src-tauri.
      const rd = await detectRunner(worktreePath, chosenDir).catch(() => ({
        runner: "web" as RunnerKind,
        srcTauriRel: null,
      }));
      if (cancelled) return;
      const resolvedRunner: RunnerKind = saved?.runner ?? rd.runner;
      runnerRef.current = resolvedRunner;
      srcTauriRelRef.current = rd.srcTauriRel;
      setRunner(resolvedRunner);
      setTauriPort(resolvedRunner === "tauri" ? tauriDevPort(root) : null);
      // Auto-config from detection; a saved config overrides per-field, but EACH
      // empty field falls back to detection. So a stale config or a subdir app
      // still auto-resolves — the user almost never fills the form by hand.
      const detected: PreviewConfig = {
        devCommand: chosen
          ? `npm run ${chosen.scriptName}`
          : detect.scriptsDev
            ? `npm run ${detect.scriptName ?? "dev"}`
            : "",
        port: defaultPort(root),
        packageDir: chosenDir,
      };
      // packageDir is VALIDATED, not trusted: a stale/wrong saved value (e.g. a
      // persisted "App" that points nowhere) would otherwise target every check +
      // the dev run at a non-existent dir and wedge the entrance. resolvePackageDir
      // keeps the saved value only when it really holds a package.json, else falls
      // back to detection / root.
      const packageDir = await resolvePackageDir(
        root,
        saved?.packageDir ?? "",
        detected.packageDir,
      );
      if (cancelled) return;
      const resolved: PreviewConfig = saved
        ? {
            devCommand: saved.devCommand.trim() || detected.devCommand,
            port: saved.port || detected.port,
            packageDir,
          }
        : detected;
      setConfig(resolved);
      setConfigLoaded(true);

      // Persist the resolved config so the preview command SURVIVES restarts —
      // even when next launch's detection can't run (worktree not ready). The CEO
      // hit "dev command isn't set" after ⌘Q + reopen because a detected-only
      // command (never explicitly Saved) wasn't written anywhere. We now cache it.
      // Rules: write only when the on-disk config is missing/stale (idempotent —
      // .bezier/ is gitignored, so no git churn), and never create a brand-new
      // EMPTY config (nothing to cache yet). An existing config is still corrected
      // (e.g. packageDir self-heal), which subsumes the old narrow self-heal.
      const persisted: PreviewConfig = {
        ...resolved,
        ...(saved?.runner ? { runner: saved.runner } : {}),
      };
      const differs =
        !saved ||
        saved.devCommand.trim() !== resolved.devCommand.trim() ||
        saved.packageDir !== resolved.packageDir ||
        saved.port !== resolved.port;
      const worthWriting = resolved.devCommand.trim().length > 0 || !!saved;
      // P1-5 (DEC-130): don't persist if the effect was torn down (issue/worktree
      // switched) — `root` here is the OLD worktree's. Belt-and-suspenders today (no
      // await sits between the cancelled check above and here), but it keeps the
      // write correct if a future await is inserted before it.
      if (differs && worthWriting && !cancelled) {
        void writePreviewConfig(root, persisted).catch(() => {});
      }

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
    setRunningPackageDir(null); // PE P2-3: nothing running → cwd follows config again
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

  const startImpl = React.useCallback(
    async (override?: PreviewConfig) => {
      if (!worktreePath) return;
      const cfg = override ?? config;
      // Attach mode (DEC-129): nothing to spawn — the attach effect polls the
      // external URL and embeds it. The user starts their own server (the terminal).
      if (cfg?.externalUrl?.trim()) return;
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
      detectedPortRef.current = null;
      urlBufRef.current = "";
      setFrameBlocked(false);

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
        // Mirror the repo's gitignored local env (.env*) into the worktree so a
        // dev server / codegen reads the same env as the real repo (DEC-112).
        // Best-effort — an env-less repo just gets nothing mirrored.
        try {
          const env = await mirrorWorktreeEnv(root, worktreePath);
          if (env.length) {
            setLog((l) => `${l}[Bezier] mirrored env: ${env.join(", ")}\n`);
          }
        } catch {
          /* best-effort */
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
      // Pin the dir this server actually launched in (PE P2-3) so the terminal opens
      // there even if the maker later edits packageDir without restarting.
      setRunningPackageDir(cfg.packageDir);
      // Track this running preview (port + viewed-time) for reattach / cap / idle.
      previewRegistry.set(previewKey, {
        port: launchPort,
        isTauri,
        lastViewedAt: Date.now(),
      });

      unlistenRef.current.push(
        await onPtyData((p) => {
          if (p.id !== id) return;
          const clean = stripAnsi(p.chunk);
          setLog((l) => {
            const next = l + clean;
            return next.length > LOG_CAP ? next.slice(next.length - LOG_CAP) : next;
          });
          // Detect the URL the dev server announced — the stack-agnostic readiness
          // signal that the poll below targets (overriding the assumed port).
          if (detectedPortRef.current === null && !isTauri) {
            urlBufRef.current = (urlBufRef.current + clean).slice(-4000);
            const found = parseDevServerUrl(urlBufRef.current);
            if (found) detectedPortRef.current = found.port;
          }
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

      // Both runners poll the dev-server port. web -> the port DETECTED from output
      // (any stack/port/monorepo), falling back to the assumed/forced port until a
      // URL appears; point the iframe there once it responds. tauri -> the assumed
      // port (the inner Next dev server on beforeDevCommand); flag "ready" without
      // an iframe url (PreviewPane renders the tauri view instead).
      const deadline = Date.now() + READY_TIMEOUT_MS;
      pollRef.current = window.setInterval(() => {
        // Superseded by a newer start / a stop -> abandon this poll.
        if (ptyIdRef.current !== id) {
          clearTimers();
          return;
        }
        const port = isTauri ? launchPort : detectedPortRef.current ?? launchPort;
        const target = previewUrl(port);
        void httpPing(target)
          .catch(() => false)
          .then((up) => {
            if (ptyIdRef.current !== id) return;
            if (up) {
              clearTimers();
              if (!isTauri) {
                setUrl(target);
                // If the app forbids iframing, surface "open in browser" instead
                // of a blank preview (best-effort; failure -> assume embeddable).
                void httpFrameBlocked(target).then(setFrameBlocked).catch(() => {});
              }
              setStatus("ready");
              // Record the live port so reattach pings the right one.
              const e = previewRegistry.get(previewKey);
              if (e) e.port = port;
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

  // Single-flight guard (P1-1, DEC-130): start() is long & async (free-port alloc,
  // node_modules clone, env mirror, pty spawn). A second concurrent call — a
  // double-click on Start, or selectApp() racing a manual Start — would ptyKillKey
  // the first server mid-spawn and double-register data/exit listeners, orphaning
  // it. Bail while one is already starting; the in-flight start owns the key.
  const startingRef = React.useRef(false);
  const start = React.useCallback(
    async (override?: PreviewConfig) => {
      if (startingRef.current) return;
      startingRef.current = true;
      try {
        await startImpl(override);
      } finally {
        startingRef.current = false;
      }
    },
    [startImpl],
  );

  const saveConfig = React.useCallback(
    async (cfg: PreviewConfig) => {
      setConfig(cfg);
      await writePreviewConfig(root, cfg);
    },
    [root],
  );

  // Switch the active app in a monorepo (DEC-125). Build a config for the chosen
  // app, persist it (so it's remembered), and restart the dev server if one is
  // running. Reads live `apps`/`status` via refs so the callback stays stable.
  const appsRef = React.useRef(apps);
  React.useEffect(() => {
    appsRef.current = apps;
  }, [apps]);
  const statusRef = React.useRef(status);
  React.useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const selectApp = React.useCallback(
    async (packageDir: string) => {
      const app = appsRef.current.find((a) => a.packageDir === packageDir);
      if (!app) return;
      const cfg: PreviewConfig = {
        devCommand: `npm run ${app.scriptName}`,
        port: defaultPort(root),
        packageDir: app.packageDir,
      };
      await saveConfig(cfg);
      // Restart onto the new app only if a server is already up.
      if (statusRef.current === "ready" || statusRef.current === "starting") {
        await start(cfg);
      }
    },
    [root, saveConfig, start],
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
      // P1-2 (DEC-130): a start() already spawned/adopted the pty for this key while
      // this reattach was awaiting the lookup — don't clobber ptyIdRef or double-add
      // listeners. The running start owns it; leave it alone.
      if (ptyIdRef.current !== null) return;
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
          // QA 1.B (DEC-130): set the error so a crash AFTER ready (status→stopped)
          // renders as an error, not the misleading "not started" EmptyState. The
          // start() exit handler already does this; the reattach path had not.
          setError(tt("previewServer.processExited"));
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
          if (!entry.isTauri) {
            setUrl(target);
            // PE P2-2 (DEC-130): restore the X-Frame-Options verdict on reattach too,
            // so returning to an un-embeddable app still offers "open in browser"
            // instead of a blank pane (the fresh-start path already does this).
            void httpFrameBlocked(target).then(setFrameBlocked).catch(() => {});
          }
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

  // The dir the dev server runs in — for the bottom-panel terminal (DEC-126).
  // PE P2-3: prefer the RUNNING server's dir; fall back to the current config when
  // nothing is running (install / first-run / attach terminal).
  const cwd = worktreePath
    ? packageCwd(worktreePath, runningPackageDir ?? config?.packageDir ?? "")
    : null;

  // Attach mode (DEC-129): the maker runs their own server (Docker/Rails/etc.) and
  // gives us its loopback URL. Bezier doesn't spawn anything — it polls the URL and
  // embeds it when up ("waiting" when down). No readiness/deps/node — it's external.
  const externalUrl = config?.externalUrl?.trim() || "";
  const attach = !!externalUrl;
  React.useEffect(() => {
    if (!externalUrl) return;
    // Drop any managed dev-server we may have started for this key — attach owns it now.
    void dropPreview(previewKey).catch(() => {});
    let cancelled = false;
    const tick = async () => {
      const up = await httpPing(externalUrl).catch(() => false);
      if (cancelled) return;
      if (up) {
        setUrl(externalUrl);
        setStatus("ready");
        setFrameBlocked(false);
      } else {
        setUrl(null);
        setStatus("starting"); // "waiting for your server"
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 1500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      // Detach / URL-change / unmount: clear the attach-owned state. Without this,
      // turning attach OFF left status stuck at "ready"/"starting" pointing at a URL
      // we no longer poll — a dead-end (the managed path never re-derives because its
      // deps didn't change). This cleanup runs ONLY when the previous run actually set
      // up polling (externalUrl was non-empty), so steady managed mode is untouched.
      // (QA 4.B, DEC-130)
      setUrl(null);
      setStatus((s) => (s === "ready" || s === "starting" ? "idle" : s));
    };
  }, [externalUrl, previewKey]);

  // Attach-first auto-detect (DEC-141 #5 ②) — issue worktrees only. The agent/maker
  // starts the dev server; Bezier DETECTS it rather than auto-starting one. While
  // WAITING (no managed server of ours, no manual external URL), poll for a server
  // the agent started — (a) the URL it wrote to <issue.dir>/preview-url, then
  // (b) any loopback port whose owning process cwd is inside THIS worktree (lsof,
  // worktree-scoped so concurrent issues don't cross-detect). On a live hit, adopt
  // it like attach (DEC-129); if it dies, fall back to waiting. Scoped to issue
  // worktrees (worktreePath !== root) so Live's managed/readiness flow is untouched
  // and the cwd-scoping stays unique. Manual external URL (attach) wins — this
  // effect bails when one is set, and the attach effect above handles it. Web runner
  // only: a tauri worktree launches a real dev WINDOW (TauriRunnerPane), so adopting
  // its inner dev server here would wrongly flip that pane to "running".
  const autoUrlRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!worktreePath || worktreePath === root || externalUrl || runner !== "web") return;
    let cancelled = false;
    // A managed dev server of OURS (fallback "have Bezier start it" / reattach) owns
    // the pane — read live via refs/registry so we yield without needing reactivity.
    const managedActive = () =>
      ptyIdRef.current !== null || startingRef.current || previewRegistry.has(previewKey);
    const adopt = (target: string) => {
      autoUrlRef.current = target;
      setAutoAttached(true);
      setUrl(target);
      setFrameBlocked(false); // the native top-level webview ignores X-Frame-Options
      setError(null);
      setStatus("ready");
    };
    const release = () => {
      if (autoUrlRef.current === null) return;
      autoUrlRef.current = null;
      setAutoAttached(false);
      setUrl(null);
      setStatus((s) => (s === "ready" || s === "starting" ? "idle" : s));
    };
    const tick = async () => {
      if (cancelled) return;
      if (managedActive()) {
        release(); // our managed server took over → drop any auto-attached state
        return;
      }
      // Keep an adopted URL only while it's alive; otherwise re-discover.
      const owned = autoUrlRef.current;
      if (owned) {
        const up = await httpPing(owned).catch(() => false);
        if (cancelled || managedActive()) return;
        if (!up) release();
        return;
      }
      // Discover: (a) the agent's declared URL first, then (b) lsof worktree-scoped.
      const candidates: string[] = [];
      if (declUrlFile) {
        const declared = await readDeclaredPreviewUrl(declUrlFile);
        if (cancelled) return;
        if (declared) candidates.push(declared);
      }
      if (candidates.length === 0) {
        const found = await discoverWorktreeUrls(worktreePath);
        if (cancelled) return;
        candidates.push(...found);
      }
      for (const c of candidates) {
        if (cancelled || managedActive()) return;
        const up = await httpPing(c).catch(() => false);
        if (cancelled || managedActive()) return;
        if (up) {
          adopt(c);
          return;
        }
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 1500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      // Leaving the issue / switching to a manual URL: drop the auto-attached state so
      // the next owner (managed / attach) re-derives cleanly (mirrors the attach
      // cleanup above). Steady managed/attach modes never set autoUrlRef, so untouched.
      if (autoUrlRef.current !== null) {
        autoUrlRef.current = null;
        setAutoAttached(false);
        setUrl(null);
        setStatus((s) => (s === "ready" || s === "starting" ? "idle" : s));
      }
    };
  }, [worktreePath, root, declUrlFile, externalUrl, previewKey, runner]);

  return {
    status,
    runner,
    tauriPort,
    config,
    cwd,
    attach,
    autoAttached,
    apps,
    selectApp,
    framework,
    scriptsDev,
    log,
    error,
    url,
    frameBlocked,
    configLoaded,
    saveConfig,
    start,
    stop,
    installing,
    installCmd,
    installDeps,
  };
}
