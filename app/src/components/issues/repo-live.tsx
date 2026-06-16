"use client";

// Repo-level "Live (現状)" view (DEC-109) — the orient-before-framing step. Run
// the CURRENT repo's dev server (read-only, NO worktree) so a maker can SEE the
// app before deciding what Issue to make. Reuses usePreviewServer pointed at the
// repo root (worktreePath === root), which skips the worktree node_modules clone
// so the real repo is never mutated. Phase 1: run + view + navigate. Phase 2
// will add annotate → "これを Issue に" (turn an observation into a new Issue).

import * as React from "react";
import {
  Play,
  Loader2,
  RotateCcw,
  ExternalLink,
  Square,
  MonitorPlay,
  Download,
  TriangleAlert,
  Wand2,
  ArrowDownToLine,
  FolderOpen,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { openExternal, openInEditor } from "@/lib/ipc";
import { useT } from "@/lib/i18n";
import { repoName } from "@/lib/workspace-root";
import { cn } from "@/lib/utils";
import { usePreviewServer } from "./use-preview-server";
import { useReadiness, type ReadinessController } from "./use-readiness";
import { useRepoFreshness, type RepoFreshness } from "./use-repo-freshness";
import type { ReadinessItem } from "@/lib/readiness";

// Resizable OUTPUT panel (matches the Issue-detail divider, DEC-033): persisted
// height in px + its floor. Default ≈ the old max-h-44 (11rem).
const LOG_HEIGHT_KEY = "bezier:live-log-height";
const LOG_MIN = 80;
const LOG_DEFAULT = 176;

export function RepoLive({ root }: { root: string }) {
  const t = useT();
  // worktreePath === root → the "live" path (no node_modules clone, read-only).
  const live = usePreviewServer(root, root, `live:${root}`);
  const { status, url, error, log, installing, installCmd, config, start, stop, installDeps } = live;
  // Repo readiness (DEC-111): detect "cloned but not set up" before Run fails
  // cryptically, and offer bounded one-click fixes (Node / deps / .env).
  const readiness = useReadiness(root, config?.packageDir ?? "");
  // Repo freshness (DEC-111 Phase 2): is the default branch behind origin? Shown
  // as a non-blocking banner — never gates Run.
  const freshness = useRepoFreshness(root);

  const [path, setPath] = React.useState("/");
  const [pathDraft, setPathDraft] = React.useState("/");

  // OUTPUT panel height, dragged via the handle at its top edge and persisted.
  const [logHeight, setLogHeight] = React.useState<number>(() => {
    if (typeof window === "undefined") return LOG_DEFAULT;
    const v = Number(window.localStorage.getItem(LOG_HEIGHT_KEY));
    return Number.isFinite(v) && v >= LOG_MIN ? v : LOG_DEFAULT;
  });
  const draggingRef = React.useRef(false);
  const onLogResizeStart = React.useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      const startY = e.clientY;
      const startH = logHeight;
      let latest = startH;
      const onMove = (ev: PointerEvent) => {
        if (!draggingRef.current) return;
        // The panel sits at the bottom — dragging UP (smaller clientY) grows it.
        const max = Math.max(LOG_MIN, window.innerHeight * 0.7);
        latest = Math.max(LOG_MIN, Math.min(max, startH + (startY - ev.clientY)));
        setLogHeight(latest);
      };
      const onUp = () => {
        draggingRef.current = false;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        try {
          window.localStorage.setItem(LOG_HEIGHT_KEY, String(latest));
        } catch {
          /* ignore */
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [logHeight],
  );

  const src = url ? url.replace(/\/+$/, "") + (path.startsWith("/") ? path : `/${path}`) : null;
  const ready = status === "ready" && !!src;
  // OUTPUT shows readiness-fix output while preparing, else the dev-server log.
  const panelLog = readiness.log.trim() ? readiness.log : log;
  const panelBusy = installing || !!readiness.busy;

  const commitPath = () => {
    let p = pathDraft.trim();
    if (p && !p.startsWith("/")) p = `/${p}`;
    setPath(p || "/");
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
        <MonitorPlay className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">{t("live.title")}</span>
        <span className="truncate text-xs text-muted-foreground">{repoName(root)}</span>
        {ready && (
          <div className="ml-auto flex items-center gap-1.5">
            <input
              value={pathDraft}
              onChange={(e) => setPathDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitPath();
                }
              }}
              onBlur={commitPath}
              placeholder={t("live.routePlaceholder")}
              className="h-7 w-36 rounded-md border bg-background px-2 font-mono text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <button
              type="button"
              onClick={() => setPath((p) => (p === "/" ? "/?_=1" : "/"))}
              title={t("live.reload")}
              aria-label={t("live.reload")}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <RotateCcw className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => src && void openExternal(src)}
              title={t("live.openExternal")}
              aria-label={t("live.openExternal")}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ExternalLink className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => void stop()}
              title={t("live.stop")}
              aria-label={t("live.stop")}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Square className="size-3 fill-current" />
            </button>
          </div>
        )}
      </div>

      <FreshnessBanner f={freshness} root={root} />

      <div className={cn("relative min-h-0 flex-1", ready && "bg-white")}>
        {ready ? (
          <iframe
            src={src!}
            title="live"
            sandbox="allow-scripts allow-same-origin allow-forms"
            className="size-full border-0"
          />
        ) : (
          <div className="flex h-full flex-col">
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
              {!readiness.loaded ? (
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              ) : readiness.ready ? (
                <>
                  <div className="flex size-12 items-center justify-center rounded-full border bg-muted/40">
                    <MonitorPlay className="size-5 text-muted-foreground" />
                  </div>
                  <p className="max-w-sm text-sm text-muted-foreground">{t("live.desc")}</p>
                  <Button
                    size="sm"
                    className="gap-1.5"
                    disabled={status === "starting" || installing}
                    onClick={() => void start()}
                  >
                    {status === "starting" ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Play className="size-3.5" />
                    )}
                    {status === "starting"
                      ? t("live.starting")
                      : error
                        ? t("live.retry")
                        : t("live.cta")}
                  </Button>

                  {/* A dev-server failure that slipped past the readiness check
                      (e.g. a bad dev command) → keep the one-click install escape. */}
                  {error && (
                    <div className="flex flex-col items-center gap-2">
                      <p className="max-w-md text-xs text-destructive">{error}</p>
                      <p className="max-w-md text-[11px] text-muted-foreground/70">{t("live.depsHint")}</p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={installing}
                        onClick={() => void installDeps()}
                      >
                        {installing ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Download className="size-3.5" />
                        )}
                        {installing
                          ? t("live.installing")
                          : t("live.installDeps", { cmd: installCmd ?? "npm install" })}
                      </Button>
                    </div>
                  )}

                  {!error && (
                    <p className="max-w-sm text-[11px] text-muted-foreground/70">{t("live.newHint")}</p>
                  )}
                </>
              ) : (
                <ReadinessChecklist readiness={readiness} onRunAnyway={() => void start()} />
              )}
            </div>

            {/* Dev-server / readiness-fix output — so a failure is never a dead
                end. Height is draggable from the top edge (DEC-033 parity). */}
            {(panelLog.trim() || panelBusy) && (
              <div
                className="flex shrink-0 flex-col border-t"
                style={{ height: logHeight }}
              >
                <div
                  role="separator"
                  aria-orientation="horizontal"
                  onPointerDown={onLogResizeStart}
                  onDoubleClick={() => setLogHeight(LOG_DEFAULT)}
                  title={t("live.resizeLog")}
                  className="group/loghandle -mt-1 flex h-2 shrink-0 cursor-row-resize items-center"
                >
                  <div className="h-px w-full bg-transparent transition-colors group-hover/loghandle:bg-primary/50" />
                </div>
                <div className="px-3 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                  {t("live.logLabel")}
                </div>
                <pre className="min-h-0 flex-1 overflow-auto bg-muted/30 px-3 pb-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
                  {panelLog.trim() || "…"}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// "Get this repo ready" (DEC-111): the items that need attention, each with a
// plain "what happens" line + a one-click fix, a "set up everything" button (in
// Node→deps→env order), and a non-blocking "run anyway" escape.
function ReadinessChecklist({
  readiness,
  onRunAnyway,
}: {
  readiness: ReadinessController;
  onRunAnyway: () => void;
}) {
  const t = useT();
  const needs = readiness.items.filter((i) => i.status === "needs");
  // Can "set up everything" only if ≥1 item is actually auto-fixable.
  const autoFixable = needs.filter((i) => !(i.id === "node" && i.nvmMissing));

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="flex flex-col items-center gap-1">
        <div className="flex size-12 items-center justify-center rounded-full border bg-muted/40">
          <Wand2 className="size-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">{t("live.readyTitle")}</p>
        <p className="text-xs text-muted-foreground">{t("live.readyIntro")}</p>
      </div>

      <ul className="flex flex-col gap-2 text-left">
        {needs.map((item) => (
          <ReadinessRow key={item.id} item={item} readiness={readiness} />
        ))}
      </ul>

      <div className="flex flex-col items-center gap-1.5">
        {autoFixable.length > 1 && (
          <Button
            size="sm"
            className="gap-1.5"
            disabled={!!readiness.busy}
            onClick={() => void readiness.fixAll()}
          >
            {readiness.busy === "all" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Wand2 className="size-3.5" />
            )}
            {t("live.readyAll")}
          </Button>
        )}
        <button
          type="button"
          onClick={onRunAnyway}
          disabled={!!readiness.busy}
          className="text-[11px] text-muted-foreground/70 underline-offset-2 hover:underline disabled:opacity-50"
        >
          {t("live.readyRunAnyway")}
        </button>
      </div>
    </div>
  );
}

// Non-blocking "your repo is N behind origin" banner (DEC-111 Phase 2). Sits
// above both the running iframe and the empty-state, so it never gates Run.
// Hidden unless there's a remote and the default branch is actually behind.
function FreshnessBanner({ f, root }: { f: RepoFreshness; root: string }) {
  const t = useT();
  if (!f.loaded || !f.hasRemote || f.behind === 0) return null;
  const updating = f.busy === "updating";
  return (
    <div className="flex shrink-0 items-start gap-2 border-b bg-muted/40 px-3 py-2">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
      <div className="min-w-0 flex-1">
        {f.diverged ? (
          <>
            <p className="text-xs leading-tight">
              {t("freshness.diverged", { base: f.base, n: f.ahead })}
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              {t("freshness.divergedHint")}
            </p>
          </>
        ) : (
          <>
            <p className="text-xs leading-tight">
              {t("freshness.behind", { base: f.base, n: f.behind })}
            </p>
            {f.lastUpdate?.blocked ? (
              <p className="mt-0.5 text-[11px] leading-snug text-destructive">
                {t("freshness.blockedDirty")}
              </p>
            ) : f.updateError ? (
              <p className="mt-0.5 text-[11px] leading-snug text-destructive">
                {t("freshness.updateFailed", { msg: f.updateError })}
              </p>
            ) : (
              f.dirty && (
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  {t("freshness.dirtyHint")}
                </p>
              )
            )}
          </>
        )}
      </div>
      {f.diverged ? (
        <Button
          size="sm"
          variant="outline"
          className="h-7 shrink-0 gap-1.5 text-[11px]"
          onClick={() => void openInEditor(root).catch(() => {})}
        >
          <FolderOpen className="size-3" />
          {t("freshness.divergedOpen")}
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="h-7 shrink-0 gap-1.5 text-[11px]"
          disabled={!!f.busy}
          onClick={() => void f.update()}
        >
          {updating ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <ArrowDownToLine className="size-3" />
          )}
          {updating ? t("freshness.updating") : t("freshness.update")}
        </Button>
      )}
    </div>
  );
}

function ReadinessRow({
  item,
  readiness,
}: {
  item: ReadinessItem;
  readiness: ReadinessController;
}) {
  const t = useT();
  const busy = readiness.busy === item.id || readiness.busy === "all";
  const v = item.nodeVersion ?? "";

  let label: string;
  let what = "";
  let fixLabel: string | null = null;
  if (item.id === "node") {
    if (item.nvmMissing) {
      label = t("live.itemNodeNoNvm", { version: v });
    } else {
      label = t("live.itemNode", { version: v });
      what = t("live.itemNodeWhat");
      fixLabel = t("live.itemNodeFix", { version: v });
    }
  } else if (item.id === "deps") {
    label = item.depsStale ? t("live.itemDepsStale") : t("live.itemDeps");
    what = item.depsStale ? t("live.itemDepsStaleWhat") : t("live.itemDepsWhat");
    fixLabel = t("live.itemDepsFix");
  } else {
    label = t("live.itemEnv", { template: item.envTemplate ?? ".env.example" });
    what = t("live.itemEnvWhat", { template: item.envTemplate ?? ".env.example" });
    fixLabel = t("live.itemEnvFix");
  }

  return (
    <li className="flex items-start gap-2 rounded-md border bg-background p-2.5">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium leading-tight">{label}</p>
        {what && <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{what}</p>}
      </div>
      {fixLabel && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 shrink-0 gap-1.5 text-[11px]"
          disabled={!!readiness.busy}
          onClick={() => void readiness.fix(item.id)}
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />}
          {fixLabel}
        </Button>
      )}
    </li>
  );
}

export default RepoLive;
