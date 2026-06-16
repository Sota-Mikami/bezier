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

/** Node versions installed under nvm (bare, e.g. "20.16.0"); [] if no nvm. */
async function nvmInstalled(): Promise<string[]> {
  try {
    const home = (await homeDir()).replace(/\/+$/, "");
    const entries = await listDir(`${home}/.nvm/versions/node`);
    return entries.filter((e) => e.isDir).map((e) => e.name.replace(/^v/, ""));
  } catch {
    return [];
  }
}

/** Whether an installed version satisfies the repo's pin. Ranges (>=, ^, ~, *,
 *  x, |) can't be checked cheaply → treated as satisfied (don't false-flag). An
 *  exact x.y.z needs an exact match; a major / major.minor matches by prefix. */
function nodeSatisfied(want: string, installed: string[]): boolean {
  const w = want.trim().replace(/^v/, "");
  if (!w || /[<>=^~|*\sx]/i.test(w)) return true;
  const parts = w.split(".");
  if (parts.length >= 3) return installed.includes(w);
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
