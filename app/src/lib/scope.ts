// Per-issue Prototype scope: which routes this issue touches (the Map's range)
// and where Preview opens (entry). Stored at <issue.dir>/scope.json — under
// `.bezier` (gitignored, OUTSIDE the worktree) so the PR stays clean. The Map
// reads the worktree app (live), it never writes to it.

import { readFile, writeFile } from "@/lib/ipc";
import { type Issue } from "@/lib/issues";

export interface Scope {
  /** Route Preview opens at (also the Map's primary screen). */
  entry: string;
  /** Routes the Map covers (this issue's range). */
  routes: string[];
}

export function scopePath(issue: Pick<Issue, "dir">): string {
  return `${issue.dir}/scope.json`;
}

/** Filesystem-safe slug for a route (`/coach/preview` → `coach_preview`). */
export function routeSlug(route: string): string {
  return route.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "root";
}

/** Where the Map's captured still for a route lives — under the issue's .bezier
 *  store (granted to capture_region, gitignored, outside the worktree). The
 *  Preview pane writes these; the Map reads them (DEC-133 Map-A). */
export function mapStillPath(issue: Pick<Issue, "dir">, route: string): string {
  return `${issue.dir}/map/${routeSlug(route)}.png`;
}

/** Normalize a user-typed route to a leading-slash path. */
export function normalizeRoute(r: string): string {
  const t = r.trim();
  if (!t || t === "/") return "/";
  return t.startsWith("/") ? t.replace(/\/+$/, "") || "/" : `/${t.replace(/\/+$/, "")}`;
}

/** Load the issue's scope (defaults to a single "/" route when absent). */
export async function readScope(issue: Pick<Issue, "dir">): Promise<Scope> {
  try {
    const raw = await readFile(scopePath(issue));
    const d = JSON.parse(raw) as { entry?: unknown; routes?: unknown };
    const routes = Array.isArray(d.routes)
      ? d.routes.filter((r): r is string => typeof r === "string").map(normalizeRoute)
      : [];
    const entry = typeof d.entry === "string" ? normalizeRoute(d.entry) : routes[0] ?? "/";
    return { entry, routes: routes.length ? routes : [entry] };
  } catch {
    return { entry: "/", routes: ["/"] };
  }
}

/** Persist the scope (PR-safe: under .bezier, never committed). */
export async function writeScope(issue: Pick<Issue, "dir">, scope: Scope): Promise<void> {
  await writeFile(scopePath(issue), `${JSON.stringify({ version: 1, ...scope }, null, 2)}\n`);
}
