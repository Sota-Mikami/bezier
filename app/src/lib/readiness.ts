// Repo readiness (DEC-111, Phase 1) — detect the common "cloned but not set up"
// snags BEFORE the dev server fails cryptically, and offer bounded, safe one-
// click fixes. We OWN only the deterministic, low-risk fixes (install the pinned
// Node, install deps, copy a .env template); complex setup is handed off, never
// auto-run. Never touches secrets; never blocks (read-only is always fine).

import { readFile, writeFile, listDir, homeDir, pathMtime } from "@/lib/ipc";
import { packageCwd, repoNodeVersion } from "@/lib/preview";

export type ReadinessId = "node" | "deps" | "env";

export interface ReadinessItem {
  id: ReadinessId;
  status: "ok" | "needs";
  /** node: the version the repo pins (.nvmrc / engines.node). */
  nodeVersion?: string;
  /** node: nvm isn't set up, so we can't auto-install — guide instead. */
  nvmMissing?: boolean;
  /** deps: node_modules exists but the lockfile is newer → reinstall (Phase 1.5).
   *  Distinguishes the "installed but stale" case from "never installed". */
  depsStale?: boolean;
  /** env: the template file found (e.g. ".env.example"). */
  envTemplate?: string;
}

/** `<dir>/<file>` exists (readFile works on dotfiles, which list_dir hides). */
async function fileExists(dir: string, file: string): Promise<boolean> {
  try {
    await readFile(`${dir}/${file}`);
    return true;
  } catch {
    return false;
  }
}

// Memoize the nvm version list with a short TTL so probing N repos for the
// sidebar badges (Phase 4) doesn't `list_dir` ~/.nvm N times. Invalidated after a
// successful node install (see invalidateNvmCache).
let nvmCache: { at: number; list: string[] } | null = null;
const NVM_TTL_MS = 30_000;

/** Drop the nvm cache (call after installing a Node version). */
export function invalidateNvmCache(): void {
  nvmCache = null;
}

/** Node versions installed under nvm (bare, e.g. "20.16.0"); [] if no nvm. */
async function nvmInstalled(): Promise<string[]> {
  const now = Date.now();
  if (nvmCache && now - nvmCache.at < NVM_TTL_MS) return nvmCache.list;
  try {
    const home = (await homeDir()).replace(/\/+$/, "");
    const entries = await listDir(`${home}/.nvm/versions/node`);
    const list = entries.filter((e) => e.isDir).map((e) => e.name.replace(/^v/, ""));
    nvmCache = { at: now, list };
    return list;
  } catch {
    nvmCache = { at: now, list: [] };
    return [];
  }
}

/** Whether an installed version satisfies the repo's pin. Ranges (>=, ^, ~, *,
 *  x, |) can't be checked cheaply → treated as satisfied (don't false-flag).
 *  An exact x.y.z pin is satisfied by any installed version of the SAME MAJOR:
 *  the run path (`withRepoNode` → `nvm use … || nvm use … || true`) already falls
 *  back to a compatible Node, so demanding the exact patch would false-block a
 *  working setup (e.g. an installed 24.15.0 against a 24.14.1 pin). Major /
 *  major.minor pins match by prefix. */
function nodeSatisfied(want: string, installed: string[]): boolean {
  const w = want.trim().replace(/^v/, "");
  if (!w || /[<>=^~|*\sx]/i.test(w)) return true;
  const parts = w.split(".");
  if (parts.length >= 3) {
    const major = parts[0];
    return installed.some((v) => v === w || v.startsWith(`${major}.`));
  }
  return installed.some((v) => v === w || v.startsWith(`${w}.`));
}

const ENV_TEMPLATES = [".env.example", ".env.sample", ".env.template", ".env.dist"];
const ENV_PRESENT = [".env", ".env.local"];

// Lockfile → the marker a fresh install writes into node_modules. We compare
// mtimes: a lockfile newer than its marker means `git pull` changed deps but
// nobody reinstalled (the classic "node_modules is there so it looks fine, then
// the dev server explodes" trap). Falls back to the node_modules dir mtime when
// the package-manager-specific marker is absent.
const LOCK_MARKERS: { lock: string; marker: string }[] = [
  { lock: "pnpm-lock.yaml", marker: "node_modules/.modules.yaml" },
  { lock: "package-lock.json", marker: "node_modules/.package-lock.json" },
  { lock: "yarn.lock", marker: "node_modules/.yarn-integrity" },
  { lock: "bun.lockb", marker: "node_modules" },
  { lock: "bun.lock", marker: "node_modules" },
];
// Fresh installs write the lockfile and the marker within the same moment; only
// flag when the lockfile is meaningfully newer to avoid same-install jitter.
const STALE_TOLERANCE_MS = 5_000;

/** node_modules exists but the present lockfile is newer than the install marker
 *  → deps need reinstalling. Conservative: any inability to compare → not stale
 *  (never false-flag a working repo). */
async function depsStale(dir: string): Promise<boolean> {
  for (const { lock, marker } of LOCK_MARKERS) {
    const lockMtime = await pathMtime(`${dir}/${lock}`).catch(() => null);
    if (lockMtime == null) continue; // this lockfile isn't the one in use
    let markerMtime = await pathMtime(`${dir}/${marker}`).catch(() => null);
    if (markerMtime == null) {
      markerMtime = await pathMtime(`${dir}/node_modules`).catch(() => null);
    }
    if (markerMtime == null) return false; // nothing to compare against
    return lockMtime > markerMtime + STALE_TOLERANCE_MS;
  }
  return false;
}

/** Probe a repo's readiness for the dev server: pinned-but-uninstalled Node,
 *  missing node_modules, and a missing .env (with a template present). Only
 *  returns items that need attention OR are explicitly ok for shown checks. */
export async function probeReadiness(
  root: string,
  packageDir: string,
): Promise<ReadinessItem[]> {
  const dir = packageCwd(root, packageDir);
  const items: ReadinessItem[] = [];

  // Node: only surface a pinned version; flag when nvm can't satisfy it.
  const want = await repoNodeVersion(dir).catch(() => null);
  if (want) {
    const installed = await nvmInstalled();
    if (installed.length === 0) {
      // No nvm detected — we can't auto-install; guide the maker.
      items.push({ id: "node", status: "needs", nodeVersion: want, nvmMissing: true });
    } else if (!nodeSatisfied(want, installed)) {
      items.push({ id: "node", status: "needs", nodeVersion: want });
    } else {
      items.push({ id: "node", status: "ok", nodeVersion: want });
    }
  }

  // Deps: node_modules present in the run dir — and, if so, not stale vs the
  // lockfile (Phase 1.5). Both the missing and the stale case fix via reinstall.
  let hasNodeModules = false;
  try {
    const entries = await listDir(dir);
    hasNodeModules = entries.some((e) => e.isDir && e.name === "node_modules");
  } catch {
    /* dir unreadable — leave false */
  }
  if (!hasNodeModules) {
    items.push({ id: "deps", status: "needs" });
  } else if (await depsStale(dir).catch(() => false)) {
    items.push({ id: "deps", status: "needs", depsStale: true });
  } else {
    items.push({ id: "deps", status: "ok" });
  }

  // Env: a template exists but no real .env yet.
  let envTemplate: string | null = null;
  for (const t of ENV_TEMPLATES) {
    if (await fileExists(dir, t)) {
      envTemplate = t;
      break;
    }
  }
  if (envTemplate) {
    let hasEnv = false;
    for (const e of ENV_PRESENT) {
      if (await fileExists(dir, e)) {
        hasEnv = true;
        break;
      }
    }
    items.push(
      hasEnv
        ? { id: "env", status: "ok", envTemplate }
        : { id: "env", status: "needs", envTemplate },
    );
  }

  return items;
}

/** Copy `<dir>/<template>` → `<dir>/.env` VERBATIM (keys + placeholders only —
 *  never invents secret VALUES). Returns the new .env path. */
export async function copyEnvTemplate(dir: string, template: string): Promise<string> {
  const content = await readFile(`${dir}/${template}`);
  const path = `${dir}/.env`;
  await writeFile(path, content);
  return path;
}

// ---------------------------------------------------------------------------
// Setup handoff (DEC-111 Phase 3) — a repo's OWN setup story (setup scripts,
// Docker, a README "Getting Started" section). Bezier detects it and hands off
// (open the README / a terminal) — it NEVER runs arbitrary setup for you.
// ---------------------------------------------------------------------------

export interface SetupSignals {
  /** package.json scripts whose NAME signals setup (name → command). */
  scripts: { name: string; cmd: string }[];
  /** top-level setup script files present, e.g. ["setup.sh","Makefile"]. */
  scriptFiles: string[];
  /** container files present, e.g. ["Dockerfile","docker-compose.yml"]. */
  docker: string[];
  /** README path + the matched Getting-Started/Setup heading (only set when a
   *  setup-ish heading was found, so a bare README doesn't trigger the card). */
  readme?: { path: string; section?: string };
  /** any signal at all → there's a setup story to hand off. */
  any: boolean;
}

const SETUP_SCRIPT_FILES = [
  "setup.sh",
  "bootstrap.sh",
  "Makefile",
  "bin/setup",
  "script/setup",
  "scripts/setup.sh",
];
const DOCKER_FILES = [
  "Dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml",
];
const README_FILES = [
  "README.md",
  "README.markdown",
  "README.mdx",
  "README.rst",
  "README.txt",
  "README",
];
// A markdown heading (h1–h4) that reads like a setup section, EN or JA.
const SETUP_HEADING_RE =
  /^#{1,4}[ \t]+(.*(?:getting started|set ?up|installation|quick ?start|running locally|local development|prerequisites|セットアップ|始め方|環境構築|インストール).*)$/im;

/** Setup-signalling scripts in a dir's package.json. Excludes `prepare`/
 *  `postinstall` (they auto-run on install → would false-flag nearly every repo). */
async function readSetupScripts(dir: string): Promise<{ name: string; cmd: string }[]> {
  try {
    const pkg = JSON.parse(await readFile(`${dir}/package.json`)) as {
      scripts?: Record<string, string>;
    };
    return Object.entries(pkg.scripts ?? {})
      .filter(
        ([n]) =>
          n === "setup" ||
          n === "bootstrap" ||
          n.endsWith(":setup") ||
          n.endsWith(":bootstrap"),
      )
      .map(([name, cmd]) => ({ name, cmd: String(cmd) }));
  } catch {
    return [];
  }
}

/** Detect a repo's setup story for the Phase 3 handoff card. All reads are
 *  best-effort (never throws). */
export async function detectSetup(root: string, packageDir = ""): Promise<SetupSignals> {
  const pkgDir = packageCwd(root, packageDir);
  // scripts from root + the package dir (monorepo), deduped by name.
  const byName = new Map<string, string>();
  for (const dir of new Set([root, pkgDir])) {
    for (const s of await readSetupScripts(dir)) {
      if (!byName.has(s.name)) byName.set(s.name, s.cmd);
    }
  }
  const scripts = [...byName].map(([name, cmd]) => ({ name, cmd }));

  const scriptFiles: string[] = [];
  for (const f of SETUP_SCRIPT_FILES) {
    if (await fileExists(root, f)) scriptFiles.push(f);
  }
  const docker: string[] = [];
  for (const f of DOCKER_FILES) {
    if (await fileExists(root, f)) docker.push(f);
  }

  let readme: { path: string; section?: string } | undefined;
  for (const f of README_FILES) {
    const content = await readFile(`${root}/${f}`).catch(() => null);
    if (content == null) continue;
    const m = content.slice(0, 32_000).match(SETUP_HEADING_RE);
    if (m) readme = { path: `${root}/${f}`, section: m[1].trim() };
    break; // first README wins (matched or not)
  }

  const any = scripts.length > 0 || scriptFiles.length > 0 || docker.length > 0 || !!readme;
  return { scripts, scriptFiles, docker, readme, any };
}
