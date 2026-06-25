"use client";

// Map — bird's-eye view of this issue's screens.
//
// Two modes:
//   MANIFEST MODE (ISSUE-006 Phase 1): when <issue.dir>/map/manifest.json exists
//     the agent has run /bezier:map and declared (screen × state) targets.
//     Renders a 2D grid: rows = routes, columns = states.
//     Each cell is either a captured still, a typed gap cell, or "not captured yet".
//   LEGACY MODE (DEC-133): no manifest → flat 1-column grid of scope routes.
//     Identical to the pre-ISSUE-006 behavior so existing worktrees still work.
//
// The Map only READS the worktree app (via previews/screenshots). It writes nothing
// to the worktree. Scope + manifest live under .bezier (gitignored).

import * as React from "react";
import {
  Plus,
  X,
  Play,
  Crosshair,
  Loader2,
  Camera,
  AlertTriangle,
  Info,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import {
  readScope,
  writeScope,
  normalizeRoute,
  mapStillPath,
  type Scope,
} from "@/lib/scope";
import {
  readManifest,
  manifestRoutes,
  manifestStates,
  manifestCell,
  manifestStillPath,
  urlEntries,
  type CaptureManifest,
  type ManifestEntry,
} from "@/lib/map-manifest";
import { loadImageDataUrl } from "@/lib/annotations";
import { AnnotationLayer } from "./design-annotations";
import { useAnnotationMode } from "./annotation-mode";
import { mapAnnotationSurface } from "./annotation-surfaces";
import type { ImplementSession } from "./implement-session-types";

const BASE_W = 1280;
const BASE_H = 800;
const CARD_W = 260;
const SCALE = CARD_W / BASE_W;
const CARD_H = Math.round(BASE_H * SCALE);

// ---------------------------------------------------------------------------
// Prop types
// ---------------------------------------------------------------------------

export function IssueMap({
  session,
  onCapture,
  onManifestCapture,
  capturing = false,
  captureProgress = null,
  captureGaps = {},
  stillsNonce = 0,
}: {
  session: ImplementSession;
  /** DEC-133 Map-A: request route-based screenshots (legacy flat grid). */
  onCapture?: (routes: string[]) => void;
  /** ISSUE-006 Phase 1: request manifest entry screenshots (screen×state grid). */
  onManifestCapture?: (entries: ManifestEntry[]) => void;
  capturing?: boolean;
  captureProgress?: { done: number; total: number } | null;
  /** Gap reasons populated by the redirect-detection pipeline (transient). */
  captureGaps?: Record<string, string>;
  /** Bump to reload the saved stills after a capture finished. */
  stillsNonce?: number;
}) {
  const t = useT();
  const issue = session.issue;
  const preview = session.preview;
  const { on: annotating } = useAnnotationMode();

  // ── Scope (legacy) ───────────────────────────────────────────────────────
  const [scope, setScope] = React.useState<Scope | null>(null);
  const [draft, setDraft] = React.useState("");
  const lastSaved = React.useRef("");

  React.useEffect(() => {
    let cancelled = false;
    void readScope(issue).then((s) => {
      if (cancelled) return;
      setScope(s);
      lastSaved.current = JSON.stringify(s);
    });
    return () => { cancelled = true; };
  }, [issue]);

  React.useEffect(() => {
    if (!scope) return;
    const json = JSON.stringify(scope);
    if (json === lastSaved.current) return;
    const h = window.setTimeout(() => {
      void writeScope(issue, scope);
      lastSaved.current = json;
    }, 400);
    return () => window.clearTimeout(h);
  }, [scope, issue]);

  // ── Manifest (ISSUE-006) ─────────────────────────────────────────────────
  const [manifest, setManifest] = React.useState<CaptureManifest | null>(null);
  const [manifestError, setManifestError] = React.useState<string | null>(null);

  // Reload manifest on mount and whenever stills update (agent may have written
  // a new manifest during a turn). We don't poll; the stillsNonce bump is enough
  // because the user can re-capture after the agent updates the manifest.
  React.useEffect(() => {
    let cancelled = false;
    void readManifest(issue)
      .then((m) => {
        if (!cancelled) {
          setManifest(m);
          setManifestError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setManifest(null);
          setManifestError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => { cancelled = true; };
  }, [issue, stillsNonce]);

  // ── Preview origin ───────────────────────────────────────────────────────
  const origin = React.useMemo(() => {
    if (!preview.url) return null;
    try { return new URL(preview.url).origin; } catch { return null; }
  }, [preview.url]);
  const ready = preview.status === "ready" && !!origin;

  // ── Legacy stills (route-keyed, DEC-133) ────────────────────────────────
  const routesKey = scope?.routes.join("|") ?? "";
  const [legacyStills, setLegacyStills] = React.useState<Record<string, string | null>>({});
  React.useEffect(() => {
    const routes = routesKey ? routesKey.split("|") : [];
    let cancelled = false;
    void (async () => {
      if (!routes.length) { if (!cancelled) setLegacyStills({}); return; }
      const entries = await Promise.all(
        routes.map(async (r) => {
          try { return [r, await loadImageDataUrl(mapStillPath(issue, r))] as const; }
          catch { return [r, null] as const; }
        }),
      );
      if (!cancelled) setLegacyStills(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
  }, [routesKey, issue, stillsNonce]);

  // ── Manifest stills (entryId-keyed, ISSUE-006) ──────────────────────────
  const [manifestStills, setManifestStills] = React.useState<Record<string, string | null>>({});
  React.useEffect(() => {
    const entries = manifest?.entries ?? [];
    let cancelled = false;
    void (async () => {
      if (!entries.length) {
        if (!cancelled) setManifestStills({});
        return;
      }
      const pairs = await Promise.all(
        entries.map(async (e) => {
          try { return [e.id, await loadImageDataUrl(manifestStillPath(issue, e.id))] as const; }
          catch { return [e.id, null] as const; }
        }),
      );
      if (!cancelled) setManifestStills(Object.fromEntries(pairs));
    })();
    return () => { cancelled = true; };
  }, [manifest, issue, stillsNonce]);

  // ── Loading guard ────────────────────────────────────────────────────────
  if (!scope) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("map.loadingMap")}
      </div>
    );
  }

  // ── Scope mutations (legacy) ─────────────────────────────────────────────
  const addRoute = () => {
    const r = normalizeRoute(draft);
    setDraft("");
    setScope((s) => (s && !s.routes.includes(r) ? { ...s, routes: [...s.routes, r] } : s));
  };
  const removeRoute = (r: string) =>
    setScope((s) => {
      if (!s) return s;
      const routes = s.routes.filter((x) => x !== r);
      const entry = s.entry === r ? routes[0] ?? "/" : s.entry;
      return { ...s, routes, entry };
    });
  const setEntry = (r: string) => setScope((s) => (s ? { ...s, entry: r } : s));

  const hasAnyLegacyStill = Object.values(legacyStills).some(Boolean);

  // ── Choose mode ──────────────────────────────────────────────────────────
  const useManifestMode = manifest !== null && manifest.entries.length > 0;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ── Top toolbar ── */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b px-3 py-2">
        {!useManifestMode && (
          <>
            <span className="mr-1 text-[11px] text-muted-foreground">{t("map.scopeLabel")}</span>
            {scope.routes.map((r) => (
              <span
                key={r}
                className={cn(
                  "group/chip flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]",
                  r === scope.entry
                    ? "border-primary/40 text-foreground"
                    : "text-muted-foreground",
                )}
              >
                <button
                  type="button"
                  onClick={() => setEntry(r)}
                  title={r === scope.entry ? t("map.entryRoute") : t("map.setEntryRoute")}
                  className={cn(
                    "flex items-center gap-1 font-mono",
                    r === scope.entry ? "text-primary" : "hover:text-foreground",
                  )}
                >
                  {r === scope.entry && <Crosshair className="size-3 shrink-0" />}
                  {r}
                </button>
                <button
                  type="button"
                  onClick={() => removeRoute(r)}
                  aria-label={t("map.removeFromScope", { r })}
                  className="hidden text-muted-foreground hover:text-foreground group-hover/chip:block"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <span className="flex items-center gap-1 rounded-md border border-dashed px-1.5 py-0.5">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); addRoute(); }
                }}
                placeholder={t("map.addRoutePlaceholder")}
                className="w-24 bg-transparent font-mono text-[11px] outline-none placeholder:text-muted-foreground/50"
              />
              <button type="button" onClick={addRoute} aria-label={t("map.addRoute")} className="text-muted-foreground hover:text-foreground">
                <Plus className="size-3" />
              </button>
            </span>
          </>
        )}

        {useManifestMode && (
          <span className="text-[11px] text-muted-foreground">
            {t("map.manifestEntryCount", { count: String(manifest.entries.length) })}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {useManifestMode && onManifestCapture && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 gap-1 px-2 text-[11px]"
              disabled={!ready || capturing}
              title={t("map.captureManifestHint")}
              onClick={() => {
                const ue = urlEntries(manifest);
                if (ue.length) onManifestCapture(ue);
              }}
            >
              {capturing ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Camera className="size-3" />
              )}
              {capturing && captureProgress
                ? t("map.capturing", {
                    done: String(captureProgress.done),
                    total: String(captureProgress.total),
                  })
                : t("map.captureManifest")}
            </Button>
          )}
          {!useManifestMode && onCapture && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 gap-1 px-2 text-[11px]"
              disabled={!ready || capturing}
              title={t("map.captureHint")}
              onClick={() => onCapture(scope.routes)}
            >
              {capturing ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Camera className="size-3" />
              )}
              {capturing && captureProgress
                ? t("map.capturing", {
                    done: String(captureProgress.done),
                    total: String(captureProgress.total),
                  })
                : t("map.updateMap")}
            </Button>
          )}
          <span className="text-[11px] text-muted-foreground">{t("map.savedToBezier")}</span>
        </div>
      </div>

      {/* ── Manifest invalid banner ── */}
      {manifestError && (
        <div className="flex shrink-0 items-start gap-2 border-b bg-destructive/5 px-3 py-2">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
          <p className="text-[11px] text-destructive">
            {t("map.manifestInvalid", { error: manifestError })}
          </p>
        </div>
      )}

      {/* ── Spec states prose-only warning ── */}
      {manifest && manifest.specStatesBlock === false && (
        <div className="flex shrink-0 items-start gap-2 border-b bg-amber-50 px-3 py-2 dark:bg-amber-950/20">
          <Info className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            {t("map.specStatesBlockMissing")}
          </p>
        </div>
      )}

      {/* ── Body ── */}
      {useManifestMode ? (
        <ManifestGrid
          session={session}
          manifest={manifest}
          stills={manifestStills}
          captureGaps={captureGaps}
          onOpenInPreview={(entry) => {
            // Navigate preview to the entry's route and switch tab (in parent).
            // For now: open the route by navigating the preview server URL.
            const base = preview.url ?? "";
            if (base) {
              const u = base.replace(/\/$/, "") + entry.route;
              window.open(u, "_blank");
            }
          }}
        />
      ) : (
        /* Legacy flat grid (DEC-133) */
        !ready && !hasAnyLegacyStill ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
            <div className="text-sm font-medium text-foreground">{t("map.liveScaledViewTitle")}</div>
            <p className="max-w-sm text-xs text-muted-foreground">
              {t("map.liveScaledViewDesc")}
            </p>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={preview.status === "starting"}
              onClick={() => void preview.start()}
            >
              {preview.status === "starting" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Play className="size-3.5" />
              )}
              {t("map.startPreview")}
            </Button>
            {/* Hint to generate a manifest */}
            {!manifestError && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                {t("map.manifestMissing")}
              </p>
            )}
          </div>
        ) : (
          <div className="relative min-h-0 flex-1">
            <div className="flex h-full flex-wrap content-start gap-4 overflow-auto p-5">
              {scope.routes.map((r) => (
                <div key={r} className="flex flex-col">
                  <div className="flex items-center gap-1.5 px-0.5 pb-1">
                    {r === scope.entry && <Crosshair className="size-3 shrink-0 text-primary" />}
                    <span className="truncate font-mono text-[11px] text-muted-foreground">{r}</span>
                  </div>
                  <div
                    className={cn(
                      "relative overflow-hidden rounded-lg border bg-white shadow-sm",
                      r === scope.entry && "ring-2 ring-primary/40",
                    )}
                    style={{ width: CARD_W, height: CARD_H }}
                  >
                    {legacyStills[r] ? (
                      // eslint-disable-next-line @next/next/no-img-element -- local data URL in Tauri webview
                      <img
                        src={legacyStills[r]!}
                        alt={r}
                        className="h-full w-full object-cover object-top"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center px-3 text-center text-[11px] text-muted-foreground">
                        {t("map.notCaptured")}
                      </div>
                    )}
                    {r !== scope.entry && (
                      <button
                        type="button"
                        onClick={() => setEntry(r)}
                        className="absolute inset-0 flex items-end justify-center bg-foreground/0 opacity-0 transition hover:bg-foreground/5 hover:opacity-100"
                      >
                        <span className="mb-2 rounded-md bg-background px-2 py-1 text-[11px] font-medium shadow">
                          {t("map.setAsStart")}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {annotating && (
              <AnnotationLayer
                session={session}
                surface={mapAnnotationSurface(session, scope.routes)}
              />
            )}
          </div>
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ManifestGrid — the screen(row) × state(col) board
// ---------------------------------------------------------------------------

function ManifestGrid({
  session,
  manifest,
  stills,
  captureGaps,
  onOpenInPreview,
}: {
  session: ImplementSession;
  manifest: CaptureManifest;
  stills: Record<string, string | null>;
  captureGaps: Record<string, string>;
  onOpenInPreview: (entry: ManifestEntry) => void;
}) {
  const t = useT();
  const { on: annotating } = useAnnotationMode();
  const routes = manifestRoutes(manifest);
  const states = manifestStates(manifest);

  return (
    <div className="relative min-h-0 flex-1 overflow-auto">
      <div className="p-4">
        <table className="border-collapse">
          <thead>
            <tr>
              {/* Top-left corner cell */}
              <th className="min-w-[100px] pb-2 pr-3 text-left">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {t("map.routeHeader")}
                </span>
              </th>
              {states.map((state) => (
                <th key={state} className="pb-2 pr-3 text-center">
                  <span className="font-mono text-[11px] font-medium text-muted-foreground">
                    {state}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {routes.map((route) => (
              <tr key={route}>
                {/* Row header = route */}
                <td className="pr-3 pb-3 align-top">
                  <span className="font-mono text-[11px] text-muted-foreground">{route}</span>
                </td>
                {states.map((state) => {
                  const entry = manifestCell(manifest, route, state);
                  return (
                    <td key={state} className="pr-3 pb-3 align-top">
                      {entry ? (
                        <ManifestCell
                          entry={entry}
                          still={stills[entry.id] ?? null}
                          gapReason={captureGaps[entry.id] ?? null}
                          onOpen={() => onOpenInPreview(entry)}
                        />
                      ) : (
                        // (route, state) pair not in manifest — sparse grid
                        <div
                          className="flex items-center justify-center rounded-lg border border-dashed bg-muted/20"
                          style={{ width: CARD_W, height: CARD_H }}
                        >
                          <span className="text-[10px] text-muted-foreground/50">—</span>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {annotating && (
        <AnnotationLayer
          session={session}
          surface={mapAnnotationSurface(session, routes)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ManifestCell — one cell in the grid: screenshot OR typed gap
// ---------------------------------------------------------------------------

type GapKind = "manual" | "seed" | "steps" | "harness" | "redirected" | "not-captured";

function gapLabel(t: ReturnType<typeof useT>, kind: GapKind): string {
  switch (kind) {
    case "manual":      return t("map.gapManual");
    case "seed":        return t("map.gapSeed");
    case "steps":       return t("map.gapSteps");
    case "harness":     return t("map.gapHarness");
    case "redirected":  return t("map.gapRedirected");
    case "not-captured": return t("map.gapNotCaptured");
  }
}

function reachToGapKind(reach: ManifestEntry["reach"]): GapKind | null {
  if (reach.kind === "url") return null; // can be captured
  switch (reach.kind) {
    case "seed":    return "seed";
    case "steps":   return "steps";
    case "harness": return "harness";
    case "manual":  return "manual";
  }
}

function ManifestCell({
  entry,
  still,
  gapReason,
  onOpen,
}: {
  entry: ManifestEntry;
  still: string | null;
  /** Populated by redirect-detection pipeline (transient). */
  gapReason: string | null;
  onOpen: () => void;
}) {
  const t = useT();
  const [tooltip, setTooltip] = React.useState(false);

  // Determine what to show:
  // 1. Still exists → screenshot thumbnail
  // 2. gapReason (redirected at runtime) → redirected gap
  // 3. reach.kind !== url → typed gap (manual / seed / steps / harness)
  // 4. reach.kind === url but no still → "not captured yet"
  const preemptiveGap = reachToGapKind(entry.reach);
  const kind: GapKind | null = still
    ? null // has screenshot
    : gapReason
    ? "redirected"
    : preemptiveGap
    ? preemptiveGap
    : "not-captured";

  const citationRef = entry.specRef ?? entry.diffRef;

  return (
    <div
      className="group relative"
      style={{ width: CARD_W, height: CARD_H }}
      onMouseEnter={() => setTooltip(true)}
      onMouseLeave={() => setTooltip(false)}
    >
      {still ? (
        <button
          type="button"
          onClick={onOpen}
          className="relative h-full w-full overflow-hidden rounded-lg border bg-white shadow-sm transition hover:ring-2 hover:ring-primary/30"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- local data URL in Tauri webview */}
          <img
            src={still}
            alt={entry.label}
            className="h-full w-full object-cover object-top"
          />
          {/* Hover overlay */}
          <div className="absolute inset-0 flex items-end justify-center bg-foreground/0 opacity-0 transition hover:bg-foreground/5 hover:opacity-100">
            <span className="mb-2 rounded-md bg-background px-2 py-1 text-[11px] font-medium shadow">
              {t("map.openInPreview")}
            </span>
          </div>
        </button>
      ) : (
        <GapCell kind={kind!} gapDetail={gapReason ?? undefined} onOpen={onOpen} />
      )}

      {/* Citation tooltip on hover */}
      {tooltip && citationRef && (
        <div className="pointer-events-none absolute -top-7 left-0 z-50 max-w-[220px] rounded-md bg-popover px-2 py-1 text-[10px] text-popover-foreground shadow-md">
          {t("map.cellCitation", { ref: citationRef })}
        </div>
      )}

      {/* Low/medium confidence badge */}
      {entry.confidence === "low" && (
        <div className="absolute right-1 top-1">
          <span className="rounded bg-amber-500/80 px-1 py-0.5 text-[9px] font-medium text-white">
            {t("map.confidenceLow")}
          </span>
        </div>
      )}
      {entry.confidence === "medium" && !still && (
        <div className="absolute right-1 top-1">
          <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-medium text-muted-foreground">
            {t("map.confidenceMedium")}
          </span>
        </div>
      )}
    </div>
  );
}

function GapCell({
  kind,
  gapDetail,
  onOpen,
}: {
  kind: GapKind;
  gapDetail?: string;
  onOpen?: () => void;
}) {
  const t = useT();
  const label = gapLabel(t, kind);
  const isClickable = kind === "not-captured" || kind === "redirected";

  return (
    <button
      type="button"
      disabled={!isClickable}
      onClick={isClickable ? onOpen : undefined}
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed",
        kind === "not-captured" && "border-muted-foreground/20 bg-muted/10",
        kind === "redirected" && "border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20",
        kind === "manual" && "border-blue-400/30 bg-blue-50/30 dark:bg-blue-950/20",
        (kind === "seed" || kind === "steps" || kind === "harness") &&
          "border-violet-400/30 bg-violet-50/30 dark:bg-violet-950/20",
        isClickable && "cursor-pointer hover:bg-muted/20",
        !isClickable && "cursor-default",
      )}
    >
      <span
        className={cn(
          "text-[11px] font-medium",
          kind === "not-captured" && "text-muted-foreground/50",
          kind === "redirected" && "text-amber-600 dark:text-amber-400",
          kind === "manual" && "text-blue-600 dark:text-blue-400",
          (kind === "seed" || kind === "steps" || kind === "harness") &&
            "text-violet-600 dark:text-violet-400",
        )}
      >
        {label}
      </span>
      {gapDetail && (
        <span className="max-w-[180px] truncate text-center text-[10px] text-muted-foreground">
          {gapDetail}
        </span>
      )}
    </button>
  );
}

export default IssueMap;
