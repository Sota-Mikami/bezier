// Preview opens the CHANGED page, not always "/" (DEC-133). Maps the files an
// agent changed in the worktree to the single most-relevant ROUTE, for file-based
// routing frameworks (Next.js App Router + Pages Router). The preview then opens
// THAT page instead of always the top page.
//
// Pure + framework-aware + safe-degrade: returns null whenever no confident route
// can be derived (unknown stack, only non-page files changed, or a fully-dynamic
// route with no fillable value) — the caller then keeps the current "/", so the
// behavior is never worse than before.

const PAGE_FILE = /\.(?:tsx|ts|jsx|js|mdx)$/;

function segmentsToRoute(segs: string[]): string | null {
  const r = "/" + segs.join("/");
  // "/" is the top page (no gain over the default) → null.
  return r === "/" ? null : r;
}

/**
 * Next.js App Router: `[src/]app/(grp)/foo/[id]/page.tsx` → `/foo`.
 * Route groups `(x)` and parallel `@slot` segments are dropped; the route is the
 * STATIC prefix up to the first dynamic `[x]` segment (we have no value to fill).
 * Only `page.*` files define a navigable route (layout/loading/route/etc → null).
 */
export function routeFromAppFile(rel: string): string | null {
  const m = rel.match(/(?:^|\/)(?:src\/)?app\/(.+)$/);
  if (!m) return null;
  const inner = m[1];
  if (!/(?:^|\/)page\.(?:tsx|ts|jsx|js|mdx)$/.test(inner)) return null;
  const dir = inner.replace(/(?:^|\/)page\.(?:tsx|ts|jsx|js|mdx)$/, "");
  const segs: string[] = [];
  for (const s of dir.split("/").filter(Boolean)) {
    if (s.startsWith("(") && s.endsWith(")")) continue; // route group — no URL segment
    if (s.startsWith("@")) continue; // parallel route slot — no URL segment
    if (/^\[.*\]$/.test(s)) break; // dynamic segment → stop at the static prefix
    segs.push(s);
  }
  return segmentsToRoute(segs);
}

/**
 * Next.js Pages Router: `[src/]pages/foo.tsx` → `/foo`, `pages/index.tsx` → `/`
 * (→ null), `pages/api/*` and `_app`/`_document`/`_error` → null.
 */
export function routeFromPagesFile(rel: string): string | null {
  const m = rel.match(/(?:^|\/)(?:src\/)?pages\/(.+)$/);
  if (!m) return null;
  if (!PAGE_FILE.test(m[1])) return null;
  const inner = m[1].replace(PAGE_FILE, "");
  if (/^api(?:\/|$)/.test(inner)) return null; // API routes aren't pages
  const segs: string[] = [];
  for (const s of inner.split("/").filter(Boolean)) {
    if (s === "_app" || s === "_document" || s === "_error") return null; // special files
    if (/^\[.*\]$/.test(s)) break; // dynamic segment → stop at the static prefix
    segs.push(s);
  }
  if (segs[segs.length - 1] === "index") segs.pop(); // `/foo/index` → `/foo`
  return segmentsToRoute(segs);
}

/**
 * Every distinct changed route + the file it came from, in input order (deduped
 * by route, keeping the first file). The caller can then rank them (e.g. by the
 * file's mtime — "the page you JUST changed" — and offer the rest as quick links).
 */
export function deriveRoutesFromChangedFiles(
  files: string[],
): { route: string; file: string }[] {
  const seen = new Set<string>();
  const out: { route: string; file: string }[] = [];
  for (const f of files) {
    const r = routeFromAppFile(f) ?? routeFromPagesFile(f);
    if (r && !seen.has(r)) {
      seen.add(r);
      out.push({ route: r, file: f });
    }
  }
  return out;
}

/**
 * The single most-relevant changed route, or null to keep the default "/".
 * When several page files changed, the MOST SPECIFIC (deepest) route wins; ties
 * keep the first occurrence (stable, deterministic).
 */
export function deriveRouteFromChangedFiles(files: string[]): string | null {
  const cands = deriveRoutesFromChangedFiles(files);
  if (!cands.length) return null;
  const depth = (r: string) => r.split("/").filter(Boolean).length;
  let best = cands[0].route;
  for (const c of cands.slice(1)) {
    if (depth(c.route) > depth(best)) best = c.route; // strict → first wins ties
  }
  return best;
}
