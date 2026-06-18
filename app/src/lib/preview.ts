// v0.5 slice 2.5 / 2.5.1 — worktree dev-server preview config + helpers.
//
// The "Design" tab runs the worktree's web app and shows it in an iframe. This
// module resolves the dev command/port/package dir (from
// <root>/.bezier/config.json, falling back to detection over the worktree's
// package.json `scripts.dev`), builds the shell command (injecting a port flag
// for known frameworks), ensures the worktree has node_modules (symlinked from
// the main repo), and exposes the Rust `http_ping` readiness probe. config.json
// lives under .bezier/ which is gitignored (DEC-008/010), so this never lands
// in the repo.
//
// slice 2.5.1 fixes two real blockers found dogfooding Bezier on itself:
//   1. the web app is often in a SUBDIR (bezier: `app/`), not the repo root,
//      so we detect a `packageDir` and run the dev server with cwd =
//      <worktree>/<packageDir>.
//   2. a fresh worktree has no node_modules (gitignored), so we symlink
//      <worktree>/<packageDir>/node_modules -> <repo>/<packageDir>/node_modules
//      before launching.

import { invoke } from "@tauri-apps/api/core";
import { readFile, writeFile, listDir, pathMtime, type FileEntry } from "@/lib/ipc";
import { tt } from "@/lib/i18n";

/**
 * Which preview runner a repo uses (slice 2.7).
 *  - "web":   dev server -> iframe (the original path).
 *  - "tauri": launch the worktree as a REAL Tauri dev window (native APIs work);
 *             NOT an iframe (a Tauri app crashes in the iframe — `invoke` is
 *             undefined, cross-origin blocks mocking, mocked native is inert).
 */
export type RunnerKind = "web" | "tauri";

/** Persisted, repo-level preview config (<root>/.bezier/config.json). */
export interface PreviewConfig {
  /** Shell command to start the dev server (e.g. "npm run dev"). */
  devCommand: string;
  /** Port the dev server should serve on / the iframe points at. */
  port: number;
  /**
   * Directory of the package to run, RELATIVE to the worktree/repo root.
   * "" means the root itself; "app" means the dev server lives in <root>/app.
   */
  packageDir: string;
  /**
   * Runner override (slice 2.7). Absent -> auto-detected (web vs tauri). Set
   * (e.g. by hand-editing config.json) to force a runner regardless of detection.
   */
  runner?: RunnerKind;
}

/** Frameworks we know how to pass a port to. */
export type Framework = "next" | "vite" | null;

/** What package.json detection found about the worktree's dev script. */
export interface DevDetect {
  /** The dev script's NAME (dev / develop / serve / start), so the run command
   *  is `npm run <name>` — not hardcoded to "dev". null if none found. */
  scriptName: string | null;
  /** The dev script's command value (for framework inference), or null. */
  scriptsDev: string | null;
  /** Framework inferred from the dev script, for port-flag injection. */
  framework: Framework;
  /** Relative dir of the package with the dev script ("" = root). */
  packageDir: string;
}

/**
 * Subdirs scanned (one level deep) for a web app when the repo root has no
 * runnable `scripts.dev`. Ordered by how common they are as a web-app home.
 */
const SUBDIR_CANDIDATES = ["app", "web", "frontend", "client", "site"] as const;

function stripTrailingSlash(p: string): string {
  return p.replace(/\/+$/, "");
}

/** Strip leading/trailing slashes (a relative package dir is never anchored). */
function normalizeRelDir(p: string): string {
  return p.replace(/^\/+/, "").replace(/\/+$/, "");
}

function configPath(root: string): string {
  return `${stripTrailingSlash(root)}/.bezier/config.json`;
}

/** Join a base dir with a relative packageDir ("" -> base unchanged). */
export function packageCwd(base: string, packageDir: string): string {
  const rel = normalizeRelDir(packageDir);
  const b = stripTrailingSlash(base);
  return rel ? `${b}/${rel}` : b;
}

/** The effective package dir for a repo: the first of [saved, detected, ""] whose
 *  `<root>/<dir>` actually contains a package.json. Guards the entrance against a
 *  stale/wrong SAVED packageDir (e.g. a persisted "App" pointing at a dir that
 *  doesn't exist) — which would otherwise target every readiness check AND the dev
 *  run at the wrong place, wedging "この repo を準備する" forever. A saved value is
 *  authoritative only when it really points at a package; else detection wins. */
export async function resolvePackageDir(
  root: string,
  saved: string,
  detected: string,
): Promise<string> {
  for (const cand of [saved, detected, ""]) {
    const c = normalizeRelDir(cand ?? "");
    if (await hasPackageJson(packageCwd(root, c)).catch(() => false)) return c;
  }
  return "";
}

/** Read the saved preview config, or null if none / malformed. */
export async function readPreviewConfig(
  root: string,
): Promise<PreviewConfig | null> {
  let text: string;
  try {
    text = await readFile(configPath(root));
  } catch {
    return null;
  }
  try {
    const data = JSON.parse(text) as Partial<PreviewConfig>;
    if (typeof data?.devCommand === "string" && typeof data?.port === "number") {
      return {
        devCommand: data.devCommand,
        port: data.port,
        // packageDir was added in slice 2.5.1; tolerate older configs ("" root).
        packageDir:
          typeof data.packageDir === "string"
            ? normalizeRelDir(data.packageDir)
            : "",
        // runner override was added in slice 2.7; only honor valid values.
        ...(data.runner === "web" || data.runner === "tauri"
          ? { runner: data.runner }
          : {}),
      };
    }
  } catch {
    /* empty / malformed -> treat as no config */
  }
  return null;
}

/** Persist the preview config (pretty JSON). */
export async function writePreviewConfig(
  root: string,
  cfg: PreviewConfig,
): Promise<void> {
  await writeFile(configPath(root), `${JSON.stringify(cfg, null, 2)}\n`);
}

/** Infer a known framework from a command/script string (for the port flag). */
export function detectFramework(cmd: string): Framework {
  if (/\bnext\b/.test(cmd)) return "next";
  if (/\bvite\b/.test(cmd)) return "vite";
  return null;
}

// Dev-script names in priority order. `dev` is conventional (Next/Vite/etc.),
// `develop` = Gatsby, `serve` = Vue CLI / Angular. `start` is ambiguous (CRA /
// Angular use it for DEV, but Next/Express use it for PRODUCTION) — only accepted
// when it doesn't look like a production start.
const DEV_SCRIPT_NAMES = ["dev", "develop", "serve", "start"];
const PROD_START_RE = /\bnext start\b|^\s*node\b|\bserve\s+-s\b|NODE_ENV=production/;

/** Pick the best dev script (dev/develop/serve/start, prod `start` excluded). */
function pickDevScript(scripts: Record<string, unknown>): { name: string; cmd: string } | null {
  for (const name of DEV_SCRIPT_NAMES) {
    const cmd = scripts[name];
    if (typeof cmd !== "string" || !cmd.trim()) continue;
    if (name === "start" && PROD_START_RE.test(cmd)) continue; // production start
    return { name, cmd };
  }
  return null;
}

/** Read a package.json's scripts + (dev+prod) dependencies, or null if absent. */
async function readPackageInfo(
  dir: string,
): Promise<{ scripts: Record<string, unknown>; deps: Record<string, string> } | null> {
  let text: string;
  try {
    text = await readFile(`${stripTrailingSlash(dir)}/package.json`);
  } catch {
    return null;
  }
  try {
    const pkg = JSON.parse(text) as {
      scripts?: Record<string, unknown>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return {
      scripts: pkg.scripts ?? {},
      deps: { ...(pkg.devDependencies ?? {}), ...(pkg.dependencies ?? {}) },
    };
  } catch {
    return null;
  }
}

/** Find the best dev script in `<dir>/package.json`: its name + command, or null. */
async function readDevScript(dir: string): Promise<{ name: string; cmd: string } | null> {
  const info = await readPackageInfo(dir);
  return info ? pickDevScript(info.scripts) : null;
}

/**
 * Locate the package to run. Prefer a dev script (dev/develop/serve/start) at the
 * repo/worktree root; otherwise scan common subdirs one level deep (`app`, `web`,
 * `frontend`, `client`, `site`) and take the first with one. Returns the script
 * NAME (for `npm run <name>`), its command, the inferred framework, and the
 * RELATIVE packageDir ("" = root). All null when nothing is found.
 */
export async function detectDev(dir: string): Promise<DevDetect> {
  const root = stripTrailingSlash(dir);

  const rootDev = await readDevScript(root);
  if (rootDev) {
    return {
      scriptName: rootDev.name,
      scriptsDev: rootDev.cmd,
      framework: detectFramework(rootDev.cmd),
      packageDir: "",
    };
  }

  for (const sub of SUBDIR_CANDIDATES) {
    const subDev = await readDevScript(`${root}/${sub}`);
    if (subDev) {
      return {
        scriptName: subDev.name,
        scriptsDev: subDev.cmd,
        framework: detectFramework(subDev.cmd),
        packageDir: sub,
      };
    }
  }

  return { scriptName: null, scriptsDev: null, framework: null, packageDir: "" };
}

/** A runnable app found in the repo (DEC-125 / ideas-backlog §G). */
export interface DetectedApp {
  /** Relative dir ("" = root). */
  packageDir: string;
  scriptName: string;
  scriptsDev: string;
  framework: Framework;
  /** Framework version from package.json deps (e.g. "15.3.9"), or null. */
  frameworkVersion: string | null;
  /** `.env.local`/`.env` present in the package dir (a "configured/active" signal). */
  hasEnvLocal: boolean;
  /** package.json mtime (recency tiebreak). */
  mtime: number;
}

// Monorepo container dirs whose CHILDREN are the apps — scanned one level deeper.
const MONOREPO_CONTAINERS = ["packages", "apps", "prototypes", "examples"] as const;

function frameworkVersionFrom(fw: Framework, deps: Record<string, string>): string | null {
  if (!fw) return null;
  const raw = deps[fw];
  return typeof raw === "string" ? raw.replace(/^[\^~>=v\s]+/, "") : null;
}

/** `.env.local`/`.env` present (existence only — never reads the file/secrets). */
async function dirHasEnvLocal(dir: string): Promise<boolean> {
  try {
    const entries = await listDir(stripTrailingSlash(dir));
    return entries.some((e) => e.name === ".env.local" || e.name === ".env");
  } catch {
    return false;
  }
}

async function appAt(root: string, packageDir: string): Promise<DetectedApp | null> {
  const dir = packageCwd(root, packageDir);
  const info = await readPackageInfo(dir);
  if (!info) return null;
  const dev = pickDevScript(info.scripts);
  if (!dev) return null;
  const framework = detectFramework(dev.cmd);
  const [hasEnvLocal, mtime] = await Promise.all([
    dirHasEnvLocal(dir),
    pathMtime(`${stripTrailingSlash(dir)}/package.json`).catch(() => null),
  ]);
  return {
    packageDir: normalizeRelDir(packageDir),
    scriptName: dev.name,
    scriptsDev: dev.cmd,
    framework,
    frameworkVersion: frameworkVersionFrom(framework, info.deps),
    hasEnvLocal,
    mtime: mtime ?? 0,
  };
}

/**
 * ALL runnable apps in a repo — root + every immediate subdir + one level inside
 * monorepo containers (packages/apps/prototypes/examples). Powers the app-picker +
 * smart default (DEC-125 / ideas-backlog §G), so a monorepo with multiple frontends
 * (e.g. `frontend/` Next 13 vs `new-frontend/` Next 15) no longer silently runs the
 * wrong one. `list_dir` already skips node_modules/.next/etc.
 */
export async function detectApps(dir: string): Promise<DetectedApp[]> {
  const root = stripTrailingSlash(dir);
  const candidates = new Set<string>([""]);
  let children: FileEntry[] = [];
  try {
    children = await listDir(root);
  } catch {
    /* unreadable root */
  }
  for (const c of children) {
    if (!c.isDir) continue;
    candidates.add(c.name);
    if ((MONOREPO_CONTAINERS as readonly string[]).includes(c.name)) {
      try {
        const grand = await listDir(c.path);
        for (const g of grand) if (g.isDir) candidates.add(`${c.name}/${g.name}`);
      } catch {
        /* unreadable container */
      }
    }
  }
  const apps = await Promise.all([...candidates].map((pd) => appAt(root, pd).catch(() => null)));
  return apps.filter((a): a is DetectedApp => a !== null);
}

/**
 * Pick the "current" app when several exist (ideas-backlog §G heuristic): prefer one
 * with local env, then a newer framework major, then most recently touched.
 */
export function pickDefaultApp(apps: DetectedApp[]): DetectedApp | undefined {
  if (apps.length <= 1) return apps[0];
  const major = (v: string | null) => {
    const m = v?.match(/^(\d+)/);
    return m ? Number(m[1]) : 0;
  };
  return [...apps].sort((a, b) => {
    if (a.hasEnvLocal !== b.hasEnvLocal) return a.hasEnvLocal ? -1 : 1;
    const ma = major(a.frameworkVersion);
    const mb = major(b.frameworkVersion);
    if (ma !== mb) return mb - ma;
    return b.mtime - a.mtime;
  })[0];
}

/** Package managers we know how to install with. */
export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

// Lockfile → manager, in priority order (a repo may carry more than one; the
// first match wins). bun has two lockfile names across versions.
const LOCKFILES: ReadonlyArray<{ file: string; manager: PackageManager }> = [
  { file: "pnpm-lock.yaml", manager: "pnpm" },
  { file: "yarn.lock", manager: "yarn" },
  { file: "bun.lockb", manager: "bun" },
  { file: "bun.lock", manager: "bun" },
  { file: "package-lock.json", manager: "npm" },
];

/** The install command for a manager (`npm install`, `pnpm install`, …). */
export function installCommand(manager: PackageManager): string {
  return `${manager} install`;
}

/**
 * Decide HOW and WHERE to install deps: walk UP from the package dir looking for
 * a lockfile (npm / pnpm / yarn / bun). This covers two real cases at once:
 *   - non-npm projects → use the matching manager, not a hard-coded `npm`.
 *   - monorepos → the lockfile + node_modules live at the workspace ROOT, above
 *     the package, so install must run there (running `npm install` inside the
 *     sub-package wouldn't populate the hoisted node_modules).
 * Falls back to `npm` in the package dir when no lockfile is found anywhere.
 */
export async function detectInstall(
  worktreePath: string,
  packageDir: string,
): Promise<{ manager: PackageManager; cwd: string }> {
  const start = packageCwd(worktreePath, packageDir);
  let dir = start;
  // Bound the walk so a stray path never loops to the filesystem root.
  for (let i = 0; i < 6; i++) {
    for (const { file, manager } of LOCKFILES) {
      if (await fileExists(dir, file)) return { manager, cwd: dir };
    }
    const parent = stripTrailingSlash(dir).replace(/\/[^/]+$/, "");
    if (!parent || parent === dir) break;
    dir = parent;
  }
  return { manager: "npm", cwd: start };
}

/**
 * A deterministic, repo-stable default port in [4100, 4179]. Deliberately away
 * from 3210 (Bezier's own dev port). Used only when no config exists yet.
 */
export function defaultPort(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return 4100 + (h % 80);
}

// ============================================================================
// slice 2.7 — Tauri runner detection + launch plumbing.
//
// A Tauri app can't be previewed in an iframe (window.__TAURI_INTERNALS__ is
// undefined, cross-origin blocks mocking, mocked native is inert). The faithful
// preview is to launch the worktree as a REAL Tauri dev window, where native
// APIs actually work. This block detects the tauri target and builds the launch
// command (a port-override so the worktree's instance doesn't collide with the
// main app's 3210).
// ============================================================================

/** True if `<dir>/<file>` is readable (cheap existence probe via read_file). */
async function fileExists(dir: string, file: string): Promise<boolean> {
  try {
    await readFile(`${stripTrailingSlash(dir)}/${file}`);
    return true;
  } catch {
    return false;
  }
}

/** What runner detection found about the worktree. */
export interface RunnerDetect {
  runner: RunnerKind;
  /**
   * Path of the Tauri crate dir RELATIVE to the worktree root (the dir that
   * holds tauri.conf.json + the Rust build `target`), or null for web. For
   * Bezier this is "app/src-tauri"; for a root-level Tauri app, "src-tauri".
   */
  srcTauriRel: string | null;
}

/**
 * Detect whether the worktree is a Tauri app. A repo is "tauri" when a
 * `src-tauri/tauri.conf.json` exists either at the repo root OR inside the
 * detected `packageDir` (bezier: the web app + Tauri crate both live under
 * `app/`, so the config is `app/src-tauri/tauri.conf.json`). Returns the runner
 * and, for tauri, the worktree-relative Tauri crate dir. Never throws.
 */
export async function detectRunner(
  worktreePath: string,
  packageDir: string,
): Promise<RunnerDetect> {
  const pkg = normalizeRelDir(packageDir);
  // Probe the packageDir-nested location first (Bezier's layout), then root.
  const candidates: string[] = [];
  if (pkg) candidates.push(`${pkg}/src-tauri`);
  candidates.push("src-tauri");

  for (const rel of candidates) {
    if (await fileExists(packageCwd(worktreePath, rel), "tauri.conf.json")) {
      return { runner: "tauri", srcTauriRel: rel };
    }
  }
  return { runner: "web", srcTauriRel: null };
}

/**
 * A deterministic, repo-stable dev port for the Tauri runner in [3300, 3399].
 * Deliberately distinct from 3210 (the main app's hardcoded dev port) and the
 * web-preview range [4100, 4179], so a worktree's Tauri instance never collides
 * with the running app or a web preview.
 */
export function tauriDevPort(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return 3300 + (h % 100);
}

/**
 * Build the shell command that launches the worktree as a real Tauri dev window
 * on `port`. Bezier's tauri.conf.json HARDCODES `beforeDevCommand:
 * "npm run dev -- -p 3210"` / `devUrl: "http://localhost:3210"`, which would
 * collide with the main app — so we pass a `--config` JSON override (Tauri v2
 * merges it) that re-points both at `port`. The `--` makes npm forward
 * `--config …` to `tauri dev`. Run with cwd = the package dir (where the `tauri`
 * npm script + src-tauri live).
 */
export function buildTauriDevCommand(port: number): string {
  const override = JSON.stringify({
    build: {
      beforeDevCommand: `npm run dev -- -p ${port}`,
      devUrl: `http://localhost:${port}`,
    },
  });
  // `override` is JSON: double-quotes only, never single-quotes -> safe to wrap
  // in single quotes for /bin/sh.
  return `npm run tauri dev -- --config '${override}'`;
}

/**
 * Build the shell command to launch. For a known framework we append the port
 * flag (`-p` for next, `--port` for vite); package-runner wrappers (npm/pnpm/
 * yarn/bun, or any `… run …`) get a `--` separator so the flag reaches the
 * framework, not the runner. Unknown commands run as-is (the user is expected to
 * encode the port themselves).
 */
// A port already specified in the dev command itself (`-p 4001`, `--port=5173`,
// `-p=3000`, `--port 8080`). When present, Bezier must NOT append its own — a
// duplicate flag is fragile (e.g. Next `… -p 4001 … -p 54460` = last wins, but the
// app no longer runs on the port the author intended). DEC-125.
const PORT_FLAG_RE = /(^|\s)(-p|--port)(\s+|=)\d+/;

export function buildDevCommand(cfg: PreviewConfig, fallback: Framework): string {
  const cmd = cfg.devCommand.trim();
  if (!cmd) return "";
  // The command pins its own port → respect it (parseDevServerUrl reads the actual
  // bound port from the output, so detection still follows it). Don't duplicate.
  if (PORT_FLAG_RE.test(cmd)) return cmd;
  // Prefer the command's own framework; fall back to the package.json hint.
  const fw = detectFramework(cmd) ?? fallback;
  if (!fw || !cfg.port) return cmd;
  const flag = fw === "next" ? `-p ${cfg.port}` : `--port ${cfg.port}`;
  // A compound command (`a && b`, `a; b`, `a || b`) already ends in its own dev
  // binary (e.g. `npm run lingui:compile && npx next dev`), so append the flag
  // DIRECTLY to the end — it attaches to that last command. The `--` form is only
  // for a bare `npm/pnpm/yarn/bun run <script>` (to forward args INTO the script);
  // using it on a compound command would mis-target the flag (DEC-127 follow-up).
  const compound = /&&|\|\||;/.test(cmd);
  const wrapped = !compound && (/^(npm|pnpm|yarn|bun)\b/.test(cmd) || /\brun\b/.test(cmd));
  return wrapped ? `${cmd} -- ${flag}` : `${cmd} ${flag}`;
}

/** The URL the iframe points at (and the readiness probe targets). */
export function previewUrl(port: number): string {
  return `http://localhost:${port}/`;
}

/**
 * Extract the port a dev server announced in its OUTPUT — the stack-agnostic
 * readiness signal. Every web dev server prints its local URL ("Local:
 * http://localhost:PORT") regardless of framework, hardcoded port, monorepo depth,
 * multi-process runner, or auto-increment on a port clash. We only match loopback
 * hosts (so a "Network: 192.168.x" line is ignored), take the LAST one (servers
 * REPRINT the final port after incrementing), and skip Bezier's own dev port
 * (3210). Returns null until a URL appears. Pass ANSI-stripped text.
 */
export function parseDevServerUrl(text: string): { port: number; url: string } | null {
  const re = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):(\d{2,5})/gi;
  let m: RegExpExecArray | null;
  let port: number | null = null;
  while ((m = re.exec(text)) !== null) {
    const p = Number(m[1]);
    if (p && p !== 3210) port = p; // last wins (reprinted after auto-increment)
  }
  return port === null ? null : { port, url: previewUrl(port) };
}

/**
 * TCP/HTTP readiness probe (Rust `http_ping`). Resolves true once the dev server
 * accepts a connection and writes a response; false otherwise. Never throws on
 * an unreachable target — it returns false.
 */
export function httpPing(url: string): Promise<boolean> {
  return invoke<boolean>("http_ping", { url });
}

/**
 * Whether the dev server forbids iframe embedding (X-Frame-Options /
 * CSP frame-ancestors), so Live can offer "open in browser" instead of a blank
 * preview. Best-effort — resolves false on any failure. (Rust `http_frame_blocked`)
 */
export function httpFrameBlocked(url: string): Promise<boolean> {
  return invoke<boolean>("http_frame_blocked", { url });
}

/** A dependency-free HTTP GET against the dev server (Rust `http_probe`, DEC-125). */
export interface HttpProbeResult {
  /** HTTP status code, or 0 if it couldn't be parsed. */
  status: number;
  /** X-Frame-Options / CSP frame-ancestors forbid embedding. */
  frameBlocked: boolean;
  /** Lowercased Content-Type header value ("" if absent). */
  contentType: string;
  /** Body bytes read (capped; a lower bound if truncated). */
  bodyLen: number;
}

/**
 * GET the currently-loaded preview URL to verify it actually renders (DEC-125).
 * Best-effort: resolves null on any failure (server momentarily down / parse error)
 * so callers keep their last verdict instead of flapping. (Rust `http_probe`)
 */
export function httpProbe(url: string): Promise<HttpProbeResult | null> {
  return invoke<HttpProbeResult>("http_probe", { url }).catch(() => null);
}

/**
 * A negative, server-observable diagnosis of the loaded page, or null when it's
 * fine / non-actionable (DEC-125). The preview pane is a status surface: rather
 * than a silent blank, a 404/5xx/empty page gets explained. SCOPE: this only sees
 * what the SERVER returns — a client-rendered SPA that 200s then blanks from a JS
 * error is invisible here (status 200 + body present → null). Do not try to detect
 * client-side blank.
 */
export type PreviewVerdict = "notFound" | "serverError" | "empty" | "frameBlocked";

const EMPTY_BODY_BYTES = 200;

export function verdictFor(p: HttpProbeResult): PreviewVerdict | null {
  if (p.status >= 500) return "serverError";
  // 404 (no route) / 401 / 403 (auth-gated) — the common "blank" causes.
  if (p.status === 404 || p.status === 401 || p.status === 403) return "notFound";
  if (p.status >= 300 && p.status < 400) return null; // redirect → the final URL drives
  if (p.status >= 200 && p.status < 300) {
    const html =
      p.contentType === "" || /text\/html|application\/xhtml/.test(p.contentType);
    // 200 but no body, or non-HTML (e.g. an API-only server returning JSON at /).
    if (p.bodyLen < EMPTY_BODY_BYTES || !html) return "empty";
    return null; // ok
  }
  if (p.status >= 400) return "notFound"; // other 4xx
  // NOTE: frameBlocked is intentionally NOT emitted — the DEC-120 native top-level
  // webview ignores X-Frame-Options, and SAMEORIGIN is ubiquitous on healthy apps,
  // so firing it would be constant false positives. Kept in the type/UI/i18n,
  // one guarded line from live should an iframe fallback ever return.
  return null;
}

/** Allocate a free TCP port so concurrent previews never collide (DEC-040). */
export function findFreePort(): Promise<number> {
  return invoke<number>("find_free_port");
}

/**
 * Create a symlink at `linkPath` pointing to `target` (Rust `symlink`). No-op if
 * `linkPath` already exists. Rejects (clear Err) if `target` does not exist —
 * e.g. the main repo's node_modules is missing. Tauri maps `linkPath` -> the
 * Rust `link_path` param.
 */
export function symlink(target: string, linkPath: string): Promise<void> {
  return invoke<void>("symlink", { target, linkPath });
}

/**
 * Clone `src` -> `dst` as a REAL directory via APFS copy-on-write (Rust
 * `clone_dir` = `cp -c -R`). Idempotent: no-op if `dst` is a real dir, replaces
 * a prior (Turbopack-rejected) symlink, clones when absent. Rejects if `src`
 * is missing. Tauri maps the camelCase keys to the Rust snake_case params.
 */
export function cloneDir(src: string, dst: string): Promise<void> {
  return invoke<void>("clone_dir", { src, dst });
}

/**
 * Symlink the MAIN repo's gitignored local env files (`.env`, `.env.local`, …,
 * at root + workspace/package subdirs) into the worktree at the same relative
 * paths, so a worktree dev server / codegen reads the same env as the real repo
 * (DEC-112). No secret duplication; only mirrors files ABSENT in the worktree.
 * Returns the mirrored relative paths. (Rust `mirror_worktree_env`)
 */
export function mirrorWorktreeEnv(root: string, worktreePath: string): Promise<string[]> {
  return invoke<string[]>("mirror_worktree_env", { root, worktreePath });
}

/**
 * Ensure the worktree's package has a real node_modules. A fresh git worktree
 * omits it (gitignored). We CLONE (CoW copy) the MAIN repo's node_modules rather
 * than symlink it: Next.js/Turbopack reject a node_modules symlink that points
 * outside the worktree project root ("points out of the filesystem root"), but a
 * clonefile copy is a real in-root directory + near-instant on APFS. `clone_dir`
 * is idempotent (no-op on a real dir; replaces a prior symlink). Throws a clear
 * error (surfaced in the Preview pane) when the main repo lacks node_modules.
 *
 *   dst = <worktree>/<packageDir>/node_modules
 *   src = <repo>/<packageDir>/node_modules
 */
export async function ensureWorktreeNodeModules(
  repoRoot: string,
  worktreePath: string,
  packageDir: string,
): Promise<void> {
  const dst = `${packageCwd(worktreePath, packageDir)}/node_modules`;
  const src = `${packageCwd(repoRoot, packageDir)}/node_modules`;
  await cloneDir(src, dst);
}

/** True when `<dir>/package.json` is readable — a runnable package lives there.
 *  Used to catch a mis-set package directory before the confusing node_modules
 *  clone error fires (a stale `packageDir` pointing at a dir that doesn't exist). */
export async function hasPackageJson(dir: string): Promise<boolean> {
  return fileExists(dir, "package.json");
}

// --- Node version: run dev/install with the repo's Node, not the app's ------
// A GUI app inherits a minimal Node (whatever nvm default / system), so dev
// servers + installs in repos that pin a Node version (`.nvmrc` / `engines.node`,
// common in mikan/Sotas repos) run on the WRONG Node and fail the engine check.
// We read the pinned version and `nvm use` it before running.

/** POSIX single-quote (so a version like ">=18" can't act as a shell redirect). */
function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** The Node version this repo wants: `.nvmrc` → `.node-version` (both explicit dev
 *  pins; the latter is used by nodenv/fnm/asdf and common in mikan repos like
 *  fs-student-web) → `engines.node`, or null. Ranges (e.g. ">=18") are returned
 *  as-is; `nvm use` falls back when it can't resolve them. */
export async function repoNodeVersion(dir: string): Promise<string | null> {
  const base = stripTrailingSlash(dir);
  try {
    const v = (await readFile(`${base}/.nvmrc`)).trim();
    if (v) return v.replace(/^v/, "");
  } catch {
    /* no .nvmrc */
  }
  try {
    // `.node-version` may carry a leading `v` or a bare semver (e.g. "24.16.0").
    const v = (await readFile(`${base}/.node-version`)).trim();
    if (v) return v.replace(/^v/, "");
  } catch {
    /* no .node-version */
  }
  try {
    const pkg = JSON.parse(await readFile(`${base}/package.json`)) as {
      engines?: { node?: unknown };
    };
    const e = typeof pkg.engines?.node === "string" ? pkg.engines.node.trim() : "";
    if (e) return e;
  } catch {
    /* no/invalid package.json */
  }
  return null;
}

/**
 * Wrap a dev/install command so it runs under the user's nvm with the repo's Node
 * version. Sources nvm explicitly (no rc-file dependency), then `nvm use`s in
 * order: the pinned version → `.nvmrc` in cwd → **the latest installed nvm node**
 * → the inherited Node. The `nvm use node` step is the key fallback: a repo that
 * doesn't pin a Node (no `.nvmrc`/`engines`) must NOT run on a stale SYSTEM node
 * (e.g. a /usr/local/bin/node 18 that fails Next 15's >=20.9 check) when the user
 * has a modern node under nvm. No-op for users without nvm (failures swallowed).
 */
export function withRepoNode(
  command: string,
  nodeVersion: string | null,
): { cmd: string; args: string[] } {
  const use = nodeVersion
    ? `nvm use ${shq(nodeVersion)} >/dev/null 2>&1 || nvm use >/dev/null 2>&1 || nvm use node >/dev/null 2>&1 || true;`
    : `nvm use >/dev/null 2>&1 || nvm use node >/dev/null 2>&1 || true;`;
  const preamble = `export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1; ${use}`;
  return { cmd: "/bin/zsh", args: ["-c", `${preamble} ${command}`] };
}

const NVM_SOURCE = `export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1;`;

/** A spawn that installs a Node version via the user's nvm (readiness fix). */
export function nvmInstallLaunch(version: string): { cmd: string; args: string[] } {
  const v = version.trim().replace(/^v/, "");
  return { cmd: "/bin/zsh", args: ["-c", `${NVM_SOURCE} nvm install ${shq(v)}`] };
}

/**
 * Resolve a dependency-install spawn: detect the manager + dir (lockfile-aware,
 * monorepo-aware), run it non-interactively (Corepack prompt off) under the
 * repo's Node. Shared by the Live install button and the readiness checklist.
 */
export async function depsInstallLaunch(
  worktreePath: string,
  packageDir: string,
): Promise<{ cwd: string; displayCmd: string; launch: { cmd: string; args: string[] } }> {
  const { manager, cwd } = await detectInstall(worktreePath, packageDir).catch(() => ({
    manager: "npm" as const,
    cwd: packageCwd(worktreePath, packageDir),
  }));
  const displayCmd = installCommand(manager);
  const node = await repoNodeVersion(cwd).catch(() => null);
  const launch = withRepoNode(`COREPACK_ENABLE_DOWNLOAD_PROMPT=0 ${displayCmd}`, node);
  return { cwd, displayCmd, launch };
}

/** Outcome of ensuring the worktree's Rust build cache. */
export interface TargetCloneResult {
  /** True if the worktree now has a cloned `target` (incremental build). */
  cloned: boolean;
  /**
   * Set when NOT cloned: the reason (e.g. the main repo has no `target` yet, so
   * the first build is from scratch). Surfaced in the launch log, NOT an error.
   */
  note?: string;
}

/**
 * Ensure the worktree's Tauri crate has a real `target/` (the Rust build cache)
 * so `tauri dev` builds INCREMENTALLY instead of from scratch. We CLONE (APFS
 * copy-on-write) the main repo's `<srcTauriRel>/target` — it is huge (GBs), and
 * clonefile makes that near-instant + near-zero disk while letting cargo reuse
 * it. Idempotent (clone_dir no-ops on a real dir). If the main repo has no
 * `target` yet (never built), this is NOT an error — the first build is just
 * slow; we report that via `note` so the UI can surface it.
 *
 *   src = <repo>/<srcTauriRel>/target
 *   dst = <worktree>/<srcTauriRel>/target
 */
export async function ensureWorktreeTauriTarget(
  repoRoot: string,
  worktreePath: string,
  srcTauriRel: string,
): Promise<TargetCloneResult> {
  const rel = normalizeRelDir(srcTauriRel);
  const src = `${packageCwd(repoRoot, rel)}/target`;
  const dst = `${packageCwd(worktreePath, rel)}/target`;
  try {
    await cloneDir(src, dst);
    return { cloned: true };
  } catch (e) {
    // clone_dir rejects when `src` is missing (repo never built) — degrade to a
    // slow first build rather than blocking the launch.
    return {
      cloned: false,
      note:
        e instanceof Error && /not found/i.test(e.message)
          ? tt("previewServer.rustCacheMissing")
          : tt("previewServer.rustCacheCloneFailed", {
              msg: e instanceof Error ? e.message : String(e),
            }),
    };
  }
}
