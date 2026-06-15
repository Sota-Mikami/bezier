"use client";

// Map — a bird's-eye board of this issue's SCOPED screens, as LIVE scaled
// previews of the real worktree app (no screenshot pipeline; always current).
// The scope (which routes + the entry) is per-issue, stored under .bezier (never
// in the PR). The Map only READS the running app; it writes nothing to it.

import * as React from "react";
import { Plus, X, Play, Crosshair, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { readScope, writeScope, normalizeRoute, type Scope } from "@/lib/scope";
import { AnnotationLayer } from "./design-annotations";
import { useAnnotationMode } from "./annotation-mode";
import { mapAnnotationSurface } from "./annotation-surfaces";
import type { ImplementSession } from "./implement-session-types";

const BASE_W = 1280;
const BASE_H = 800;
const CARD_W = 300;
const SCALE = CARD_W / BASE_W;
const CARD_H = Math.round(BASE_H * SCALE);

export function IssueMap({ session }: { session: ImplementSession }) {
  const t = useT();
  const issue = session.issue;
  const preview = session.preview;
  const { on: annotating } = useAnnotationMode();
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
    return () => {
      cancelled = true;
    };
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

  const origin = React.useMemo(() => {
    if (!preview.url) return null;
    try {
      return new URL(preview.url).origin;
    } catch {
      return null;
    }
  }, [preview.url]);
  const ready = preview.status === "ready" && !!origin;

  if (!scope) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("map.loadingMap")}
      </div>
    );
  }

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

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Scope chips — editable any time (even before Preview starts). */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b px-3 py-2">
        <span className="mr-1 text-[11px] text-muted-foreground">{t("map.scopeLabel")}</span>
        {scope.routes.map((r) => (
          <span
            key={r}
            className={cn(
              "group/chip flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]",
              r === scope.entry ? "border-primary/40 text-foreground" : "text-muted-foreground",
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
              if (e.key === "Enter") {
                e.preventDefault();
                addRoute();
              }
            }}
            placeholder={t("map.addRoutePlaceholder")}
            className="w-24 bg-transparent font-mono text-[11px] outline-none placeholder:text-muted-foreground/50"
          />
          <button type="button" onClick={addRoute} aria-label={t("map.addRoute")} className="text-muted-foreground hover:text-foreground">
            <Plus className="size-3" />
          </button>
        </span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {t("map.savedToBezier")}
        </span>
      </div>

      {/* Body: live scaled board when Preview is up, else a start prompt. */}
      {!ready ? (
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
                <iframe
                  src={`${origin}${r}`}
                  sandbox="allow-scripts allow-same-origin allow-forms"
                  title={r}
                  tabIndex={-1}
                  style={{
                    width: BASE_W,
                    height: BASE_H,
                    transform: `scale(${SCALE})`,
                    transformOrigin: "top left",
                    border: 0,
                    pointerEvents: "none",
                  }}
                />
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
      )}
    </div>
  );
}

export default IssueMap;
