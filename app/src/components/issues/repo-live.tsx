"use client";

// Repo-level "Live (現状)" view (DEC-109) — the orient-before-framing step. Run
// the CURRENT repo's dev server (read-only, NO worktree) so a maker can SEE the
// app before deciding what Issue to make. Reuses usePreviewServer pointed at the
// repo root (worktreePath === root), which skips the worktree node_modules clone
// so the real repo is never mutated. Phase 1: run + view + navigate. Phase 2
// will add annotate → "これを Issue に" (turn an observation into a new Issue).

import * as React from "react";
import dynamic from "next/dynamic";
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
  FileText,
  Container,
  Terminal as TerminalIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { openExternal, openInEditor } from "@/lib/ipc";
import { useT } from "@/lib/i18n";
import { repoName } from "@/lib/workspace-root";
import { packageCwd } from "@/lib/preview";
import { cn } from "@/lib/utils";
import { setRepoStatus } from "@/lib/repo-status";
import { usePreviewServer } from "./use-preview-server";
import { useReadiness, type ReadinessController } from "./use-readiness";
import { useRepoFreshness, type RepoFreshness } from "./use-repo-freshness";
import { useSetupSignals } from "./use-setup-signals";
import type { ReadinessItem, SetupSignals } from "@/lib/readiness";
import type { TerminalPaneProps } from "@/components/workspace/terminal";

// xterm-backed terminal for the Phase 3 setup handoff — client-only (DOM + CSS),
// dynamically imported (output: "export"). No `spawn` → bare login shell (nothing
// auto-runs); no `sessionKey` → killed on unmount (no orphan pty).
const TerminalPane = dynamic(() => import("@/components/workspace/terminal"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="size-4 animate-spin text-muted-foreground" />
    </div>
  ),
}) as React.ComponentType<TerminalPaneProps>;

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
  // Setup handoff (DEC-111 Phase 3): does the repo have its own setup story we
  // should open (never run)? Plus a throwaway terminal for the maker to run it.
  const packageDir = config?.packageDir ?? "";
  const setup = useSetupSignals(root, packageDir);
  const [showTerminal, setShowTerminal] = React.useState(false);

  // Publish the active repo's truth to the sidebar badge store (DEC-111 Phase 4)
  // so its badge is instantly correct after a one-click fix / update — without
  // waiting for the sidebar's slow probe loop.
  React.useEffect(() => {
    if (readiness.loaded) {
      setRepoStatus(root, { needsSetup: !readiness.ready, checkedAt: Date.now() });
    }
  }, [root, readiness.loaded, readiness.ready]);
  React.useEffect(() => {
    if (freshness.loaded) {
      setRepoStatus(root, {
        updateAvailable: freshness.hasRemote && freshness.behind > 0,
        checkedAt: Date.now(),
      });
    }
  }, [root, freshness.loaded, freshness.hasRemote, freshness.behind]);

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

      <div className={cn("relative min-h-0 flex-1", ready && !showTerminal && "bg-white")}>
        {showTerminal ? (
          <SetupTerminal
            cwd={packageCwd(root, packageDir)}
            onClose={() => setShowTerminal(false)}
          />
        ) : ready ? (
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
                      <p className="max-w-md text-[11px] text-muted-foreground/70">{t("live.startFailedHint")}</p>
                      <div className="flex flex-wrap items-center justify-center gap-2">
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
                        {/* Hand off: let the maker run the dev server themselves in a
                            terminal at the repo cwd (any stack Bezier can't auto-run). */}
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => setShowTerminal(true)}
                        >
                          <TerminalIcon className="size-3.5" />
                          {t("live.openTerminalManual")}
                        </Button>
                      </div>
                    </div>
                  )}

                  {!error && (
                    <p className="max-w-sm text-[11px] text-muted-foreground/70">{t("live.newHint")}</p>
                  )}

                  {/* Even when ready, let the maker open the repo's own setup. */}
                  {setup?.any && (
                    <button
                      type="button"
                      onClick={() => setShowTerminal(true)}
                      className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                    >
                      {t("live.setupEscape")}
                    </button>
                  )}
                </>
              ) : (
                <ReadinessChecklist
                  readiness={readiness}
                  onRunAnyway={() => void start()}
                  setup={setup}
                  root={root}
                  onOpenTerminal={() => setShowTerminal(true)}
                />
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
  setup,
  root,
  onOpenTerminal,
}: {
  readiness: ReadinessController;
  onRunAnyway: () => void;
  setup: SetupSignals | null;
  root: string;
  onOpenTerminal: () => void;
}) {
  const t = useT();
  const [rechecking, setRechecking] = React.useState(false);
  const needs = readiness.items.filter((i) => i.status === "needs");
  // Can "set up everything" only if ≥1 item is actually auto-fixable.
  const autoFixable = needs.filter((i) => !(i.id === "node" && i.nvmMissing));

  const recheck = async () => {
    if (rechecking || readiness.busy) return;
    setRechecking(true);
    try {
      await readiness.reprobe();
    } finally {
      setRechecking(false);
    }
  };

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
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void recheck()}
            disabled={!!readiness.busy || rechecking}
            className="flex items-center gap-1 text-[11px] text-muted-foreground/70 underline-offset-2 hover:underline disabled:opacity-50"
          >
            {rechecking ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <RotateCcw className="size-3" />
            )}
            {t("live.recheck")}
          </button>
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

      {setup?.any && (
        <SetupHandoffCard signals={setup} root={root} onOpenTerminal={onOpenTerminal} />
      )}
    </div>
  );
}

// Setup handoff (DEC-111 Phase 3): a repo's OWN setup (scripts/Docker/README) is
// NOT Bezier's to run — we detect it and open it. Buttons only; nothing executes.
function SetupHandoffCard({
  signals,
  root,
  onOpenTerminal,
}: {
  signals: SetupSignals;
  root: string;
  onOpenTerminal: () => void;
}) {
  const t = useT();
  const dockerFile = signals.docker[0];
  return (
    <div className="rounded-md border bg-muted/30 p-3 text-left">
      <p className="text-xs font-medium">{t("live.setupTitle")}</p>
      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
        {t("live.setupIntro")}
      </p>
      {signals.scripts.length > 0 && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t("live.setupScriptHint", { names: signals.scripts.map((s) => s.name).join(", ") })}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {signals.readme && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-[11px]"
            onClick={() => void openInEditor(signals.readme!.path).catch(() => {})}
          >
            <FileText className="size-3" />
            {signals.readme.section
              ? t("live.setupOpenReadmeSection", { section: signals.readme.section })
              : t("live.setupOpenReadme")}
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-[11px]"
          onClick={onOpenTerminal}
        >
          <TerminalIcon className="size-3" />
          {t("live.setupOpenTerminal")}
        </Button>
        {dockerFile && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-[11px]"
            onClick={() => void openInEditor(`${root}/${dockerFile}`).catch(() => {})}
          >
            <Container className="size-3" />
            {t("live.setupOpenDockerfile")}
          </Button>
        )}
      </div>
    </div>
  );
}

// A throwaway terminal for the maker to run setup themselves (DEC-111 Phase 3).
// Bare login shell at the repo cwd — nothing auto-runs; killed on unmount.
function SetupTerminal({ cwd, onClose }: { cwd: string; onClose: () => void }) {
  const t = useT();
  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
        <TerminalIcon className="size-3.5 text-muted-foreground" />
        <span className="truncate font-mono text-[11px] text-muted-foreground">{cwd}</span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded-md px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {t("live.setupCloseTerminal")}
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <TerminalPane cwd={cwd} />
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
