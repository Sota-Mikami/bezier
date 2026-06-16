"use client";

// Repo-level "Live (現状)" view (DEC-109) — the orient-before-framing step. Run
// the CURRENT repo's dev server (read-only, NO worktree) so a maker can SEE the
// app before deciding what Issue to make. Reuses usePreviewServer pointed at the
// repo root (worktreePath === root), which skips the worktree node_modules clone
// so the real repo is never mutated. Phase 1: run + view + navigate. Phase 2
// will add annotate → "これを Issue に" (turn an observation into a new Issue).

import * as React from "react";
import { Play, Loader2, RotateCcw, ExternalLink, Square, MonitorPlay, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { openExternal } from "@/lib/ipc";
import { useT } from "@/lib/i18n";
import { repoName } from "@/lib/workspace-root";
import { cn } from "@/lib/utils";
import { usePreviewServer } from "./use-preview-server";

export function RepoLive({ root }: { root: string }) {
  const t = useT();
  // worktreePath === root → the "live" path (no node_modules clone, read-only).
  const live = usePreviewServer(root, root, `live:${root}`);
  const { status, url, error, log, installing, start, stop, installDeps } = live;

  const [path, setPath] = React.useState("/");
  const [pathDraft, setPathDraft] = React.useState("/");

  const src = url ? url.replace(/\/+$/, "") + (path.startsWith("/") ? path : `/${path}`) : null;
  const ready = status === "ready" && !!src;

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
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
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

              {/* On failure (commonly missing node_modules) → offer a one-click
                  install so a maker never needs the terminal (DEC-109). */}
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
                    {installing ? t("live.installing") : t("live.installDeps")}
                  </Button>
                </div>
              )}

              {!error && (
                <p className="max-w-sm text-[11px] text-muted-foreground/70">{t("live.newHint")}</p>
              )}
            </div>

            {/* Dev-server / install output — so a failure is never a dead end. */}
            {(log.trim() || installing) && (
              <div className="shrink-0 border-t">
                <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                  {t("live.logLabel")}
                </div>
                <pre className="max-h-44 overflow-auto bg-muted/30 px-3 pb-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
                  {log.trim() || "…"}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default RepoLive;
