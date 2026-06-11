// v0.5 slice 2.5 / 2.5.1 — worktree dev-server preview config + helpers.
//
// The "Design" tab runs the worktree's web app and shows it in an iframe. This
// module resolves the dev command/port/package dir (from
// <root>/.continuum/config.json, falling back to detection over the worktree's
// package.json `scripts.dev`), builds the shell command (injecting a port flag
// for known frameworks), ensures the worktree has node_modules (symlinked from
// the main repo), and exposes the Rust `http_ping` readiness probe. config.json
// lives under .continuum/ which is gitignored (DEC-008/010), so this never lands
// in the repo.
//
// slice 2.5.1 fixes two real blockers found dogfooding continuum on itself:
//   1. the web app is often in a SUBDIR (continuum: `app/`), not the repo root,
//      so we detect a `packageDir` and run the dev server with cwd =
//      <worktree>/<packageDir>.
//   2. a fresh worktree has no node_modules (gitignored), so we symlink
//      <worktree>/<packageDir>/node_modules -> <repo>/<packageDir>/node_modules
//      before launching.

import { invoke } from "@tauri-apps/api/core";
import { readFile, writeFile } from "@/lib/ipc";

/** Persisted, repo-level preview config (<root>/.continuum/config.json). */
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
}

/** Frameworks we know how to pass a port to. */
export type Framework = "next" | "vite" | null;

/** What package.json detection found about the worktree's dev script. */
export interface DevDetect {
  /** package.json `scripts.dev` value, or null if none found. */
  scriptsDev: string | null;
  /** Framework inferred from scripts.dev, for port-flag injection. */
  framework: Framework;
  /** Relative dir of the package with scripts.dev ("" = root). */
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
  return `${stripTrailingSlash(root)}/.continuum/config.json`;
}

/** Join a base dir with a relative packageDir ("" -> base unchanged). */
export function packageCwd(base: string, packageDir: string): string {
  const rel = normalizeRelDir(packageDir);
  const b = stripTrailingSlash(base);
  return rel ? `${b}/${rel}` : b;
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

/** Read a `scripts.dev` string from `<dir>/package.json`, or null. */
async function readScriptsDev(dir: string): Promise<string | null> {
  let text: string;
  try {
    text = await readFile(`${stripTrailingSlash(dir)}/package.json`);
  } catch {
    return null;
  }
  try {
    const pkg = JSON.parse(text) as { scripts?: Record<string, unknown> };
    const dev = pkg.scripts?.dev;
    return typeof dev === "string" && dev.trim() ? dev : null;
  } catch {
    return null;
  }
}

/**
 * Locate the package to run. Prefer a `scripts.dev` at the repo/worktree root;
 * otherwise scan common subdirs one level deep (`app`, `web`, `frontend`,
 * `client`, `site`) and take the first with a `scripts.dev`. Returns the dev
 * script, inferred framework, and the RELATIVE packageDir ("" = root). When
 * nothing is found, packageDir is "" and scriptsDev is null.
 */
export async function detectDev(dir: string): Promise<DevDetect> {
  const root = stripTrailingSlash(dir);

  const rootDev = await readScriptsDev(root);
  if (rootDev) {
    return { scriptsDev: rootDev, framework: detectFramework(rootDev), packageDir: "" };
  }

  for (const sub of SUBDIR_CANDIDATES) {
    const subDev = await readScriptsDev(`${root}/${sub}`);
    if (subDev) {
      return {
        scriptsDev: subDev,
        framework: detectFramework(subDev),
        packageDir: sub,
      };
    }
  }

  return { scriptsDev: null, framework: null, packageDir: "" };
}

/**
 * A deterministic, repo-stable default port in [4100, 4179]. Deliberately away
 * from 3210 (continuum's own dev port). Used only when no config exists yet.
 */
export function defaultPort(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return 4100 + (h % 80);
}

/**
 * Build the shell command to launch. For a known framework we append the port
 * flag (`-p` for next, `--port` for vite); package-runner wrappers (npm/pnpm/
 * yarn/bun, or any `… run …`) get a `--` separator so the flag reaches the
 * framework, not the runner. Unknown commands run as-is (the user is expected to
 * encode the port themselves).
 */
export function buildDevCommand(cfg: PreviewConfig, fallback: Framework): string {
  const cmd = cfg.devCommand.trim();
  if (!cmd) return "";
  // Prefer the command's own framework; fall back to the package.json hint.
  const fw = detectFramework(cmd) ?? fallback;
  if (!fw || !cfg.port) return cmd;
  const flag = fw === "next" ? `-p ${cfg.port}` : `--port ${cfg.port}`;
  const wrapped = /^(npm|pnpm|yarn|bun)\b/.test(cmd) || /\brun\b/.test(cmd);
  return wrapped ? `${cmd} -- ${flag}` : `${cmd} ${flag}`;
}

/** The URL the iframe points at (and the readiness probe targets). */
export function previewUrl(port: number): string {
  return `http://localhost:${port}/`;
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
