"use client";

// v0.5 slice 2.5 — the visual half of the Design tab.
//
// Presentational only: renders the live worktree app in an iframe once the
// dev server (owned by usePreviewServer in the parent) reports ready, plus a
// settings form (dev command / port), start/stop/reload controls, and a log
// surface for the starting/error states. No process lifecycle lives here.

import * as React from "react";
import {
  Loader2,
  Play,
  Square,
  RotateCw,
  Settings2,
  TriangleAlert,
  MonitorPlay,
  AppWindow,
  Monitor,
  Tablet,
  Smartphone,
  Maximize2,
  RotateCwSquare,
  Route,
  Ruler,
  ExternalLink,
  Terminal,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { openExternal, openLiveWindow, captureRegion } from "@/lib/ipc";
import { loadImageDataUrl } from "@/lib/annotations";
import { cn } from "@/lib/utils";
import { useT, tt } from "@/lib/i18n";
import { previewFeedbackPrompt } from "@/lib/prompts";
import type { PreviewConfig } from "@/lib/preview";
import type { PreviewServer, PreviewStatus } from "./use-preview-server";
import type { ImplementSession } from "./implement-session-types";
import { AnnotationLayer, type AnnotationSurface } from "./design-annotations";
import { useAnnotationMode } from "./annotation-mode";
import { EmbeddedBrowser } from "./embedded-browser";
import { AppPicker } from "./app-picker";
import { usePreviewDiagnostic } from "./use-preview-diagnostic";
import { PreviewDiagnosticBanner } from "./preview-diagnostic-banner";
import { PreviewBottomPanel, type PanelTab } from "./preview-bottom-panel";

function statusLabel(status: PreviewStatus): string {
  switch (status) {
    case "idle":
      return tt("preview.statusIdle");
    case "starting":
      return tt("preview.statusStarting");
    case "ready":
      return tt("preview.statusReady");
    case "error":
      return tt("preview.statusError");
    case "stopped":
      return tt("preview.statusStopped");
  }
}

// The "build" annotation surface (DEC-056): pins on the live preview become fix
// requests against the worktree CODE. Element-pick is available (cooperating
// preview); sending needs a worktree.
function buildAnnotationSurface(session: ImplementSession, route: string): AnnotationSurface {
  return {
    key: "build",
    canSend: !!session.ref,
    cannotSendMessage: tt("preview.cannotSendNoWorktree"),
    // Name the screen being annotated so the agent knows WHICH page (it locates
    // the code itself — we don't prescribe how). DEC-108 / precise-mode v1.
    buildPrompt: (lines, shot) => previewFeedbackPrompt(route, lines, shot),
    send: (p, n) => session.sendDesignFeedback(p, n),
  };
}

function StatusBadge({ status }: { status: PreviewStatus }) {
  return (
    <Badge variant="outline" className="gap-1.5 font-normal">
      <span
        className={cn(
          "size-2 rounded-full",
          status === "ready" && "bg-emerald-500",
          status === "starting" && "bg-amber-500",
          status === "error" && "bg-red-500",
          (status === "idle" || status === "stopped") && "bg-muted-foreground",
        )}
      />
      {statusLabel(status)}
    </Badge>
  );
}

// The status badge doubles as the Stop control (DEC-064, CEO): when the server
// is running, hovering the "稼働中" badge swaps it to a red "停止" — click to stop.
// Keeps Stop off the toolbar surface while still one click away.
function RunningBadge({
  status,
  onStop,
}: {
  status: PreviewStatus;
  onStop: () => void;
}) {
  const t = useT();
  if (status !== "ready" && status !== "starting") {
    return <StatusBadge status={status} />;
  }
  return (
    <button
      type="button"
      onClick={onStop}
      title={t("preview.clickToStop")}
      className="group/stop inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-normal text-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
    >
      <span
        className={cn(
          "size-2 rounded-full group-hover/stop:hidden",
          status === "ready" ? "bg-emerald-500" : "bg-amber-500",
        )}
      />
      <Square className="hidden size-3 fill-current group-hover/stop:inline" />
      <span className="group-hover/stop:hidden">{statusLabel(status)}</span>
      <span className="hidden group-hover/stop:inline">{t("common.stop")}</span>
    </button>
  );
}

// Responsive viewport presets for the preview (DEC-064). `fluid` fills the pane;
// the device presets constrain the iframe to a real width/height (centered) so
// media queries / reflow can be checked. Rotate swaps w/h.
type DeviceId = "fluid" | "desktop" | "tablet" | "mobile" | "custom";
const DEVICES: {
  id: DeviceId;
  icon: typeof Monitor;
  w?: number;
  h?: number;
}[] = [
  { id: "fluid", icon: Maximize2 },
  { id: "desktop", icon: Monitor, w: 1280, h: 800 },
  { id: "tablet", icon: Tablet, w: 768, h: 1024 },
  { id: "mobile", icon: Smartphone, w: 390, h: 844 },
  { id: "custom", icon: Ruler },
];

function deviceLabel(id: DeviceId): string {
  switch (id) {
    case "fluid":
      return tt("preview.deviceFluid");
    case "desktop":
      return tt("preview.deviceDesktop");
    case "tablet":
      return tt("preview.deviceTablet");
    case "mobile":
      return tt("preview.deviceMobile");
    case "custom":
      return tt("preview.deviceCustom");
  }
}

export function PreviewPane({
  server,
  hasRef,
  session,
}: {
  server: PreviewServer;
  hasRef: boolean;
  /** When present (web runner), enables the design-feedback overlay (DEC-045). */
  session?: ImplementSession;
}) {
  const t = useT();
  const { status, config, apps, selectApp, scriptsDev, log, error, url, configLoaded } = server;
  const { on: annotating } = useAnnotationMode();

  const [showSettings, setShowSettings] = React.useState(false);
  // VS-Code-style bottom panel (DEC-126): OUTPUT (dev log) + Terminal (run claude/
  // commands in the app's dir). Open state + active tab kept separately so the tab
  // survives close/reopen. The banner's "Show output" opens it on OUTPUT.
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [panelTab, setPanelTab] = React.useState<PanelTab>("output");
  const [reloadNonce, setReloadNonce] = React.useState(0);
  // Single mode (DEC-120): the preview IS the native embedded browser — OAuth
  // works inline. A native webview paints above HTML, so to annotate we FREEZE
  // it to a screenshot, hide the webview, and let the maker mark up the still
  // (the agent gets the same annotated shot as before). `frozenShot` holds that
  // still while annotating; `containerRef` is the rect we capture + the webview
  // tracks.
  const [frozenShot, setFrozenShot] = React.useState<string | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  // Responsive viewport (DEC-064) + navigated path. Custom width/height (DEC-074).
  const [deviceId, setDeviceId] = React.useState<DeviceId>("fluid");
  const [portrait, setPortrait] = React.useState(true);
  const [customW, setCustomW] = React.useState(420);
  const [customH, setCustomH] = React.useState(900);
  const [path, setPath] = React.useState("/");
  const [pathDraft, setPathDraft] = React.useState("/");
  const pathInputRef = React.useRef<HTMLInputElement | null>(null);

  const running = status === "starting" || status === "ready";

  // Measure the pane body so device presets can be CAPPED to it. A native
  // embedded webview can't clip/scroll inside a smaller container (it ignores
  // overflow), so a device larger than the pane would draw OUTSIDE it (DEC-120
  // bug). Capping = the webview never exceeds the visible pane: device ≤ pane →
  // exact size; device > pane → fits the pane (no scroll-to-exact, which a
  // native webview can't do anyway).
  const paneRef = React.useRef<HTMLDivElement | null>(null);
  const [paneSize, setPaneSize] = React.useState<{ w: number; h: number } | null>(null);
  React.useEffect(() => {
    const el = paneRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setPaneSize((prev) =>
        prev && Math.round(prev.w) === Math.round(r.width) && Math.round(prev.h) === Math.round(r.height)
          ? prev
          : { w: r.width, h: r.height },
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const device = DEVICES.find((d) => d.id === deviceId) ?? DEVICES[0];
  const isFluid = deviceId === "fluid";
  const isCustom = deviceId === "custom";
  // p-4 backdrop padding (16px both sides) is reserved when capping.
  const maxW = paneSize ? Math.max(160, paneSize.w - 32) : Infinity;
  const maxH = paneSize ? Math.max(160, paneSize.h - 32) : Infinity;
  const rawVw = isCustom ? Math.max(160, customW) : portrait ? device.w! : device.h!;
  const rawVh = isCustom ? Math.max(160, customH) : portrait ? device.h! : device.w!;
  const vw = isFluid ? null : Math.min(rawVw, maxW);
  const vh = isFluid ? null : Math.min(rawVh, maxH);

  const src = url
    ? url.replace(/\/+$/, "") + (path.startsWith("/") ? path : `/${path}`)
    : undefined;

  const applyPath = React.useCallback(() => {
    let p = pathDraft.trim();
    if (!p.startsWith("/")) p = `/${p}`;
    setPath(p);
    setPathDraft(p);
    setReloadNonce((n) => n + 1); // navigate (force even if unchanged)
  }, [pathDraft]);

  // Reflect the browser's OWN navigation in the address bar (DEC-120 follow-up):
  // the page redirects (auth gate, OAuth return), follows links, or pushState's —
  // mirror that into the path box so it always shows where the preview really is.
  // Only same-origin (in-app) nav is reflected; during OAuth the browser is
  // briefly on an external origin (accounts.google.com) which we can't express as
  // an in-app path, so we leave the last in-app path showing until it returns.
  const onEmbedNavigate = React.useCallback(
    (rawUrl: string) => {
      if (!url) return;
      try {
        const nav = new URL(rawUrl);
        const base = new URL(url);
        if (nav.origin !== base.origin) return; // external (OAuth) → don't reflect
        const rel = (nav.pathname + nav.search + nav.hash) || "/";
        setPath(rel);
        // Don't clobber what the user is actively typing into the path box.
        if (document.activeElement !== pathInputRef.current) setPathDraft(rel);
      } catch {
        /* unparseable URL → ignore */
      }
    },
    [url],
  );

  // Self-diagnose a ready-but-blank page (DEC-125): probe the loaded URL and show
  // a banner for 404/5xx/empty instead of a silent blank. Feed the same onNavigate
  // signal that drives the address bar.
  const diag = usePreviewDiagnostic({
    ready: status === "ready" && !!url,
    baseUrl: url,
    src: src ?? null,
  });
  const diagNavigate = diag.onNavigate;
  const handleNavigate = React.useCallback(
    (u: string) => {
      onEmbedNavigate(u);
      diagNavigate(u);
    },
    [onEmbedNavigate, diagNavigate],
  );

  const handleSubmit = React.useCallback(
    async (cfg: PreviewConfig, alsoStart: boolean) => {
      await server.saveConfig(cfg);
      setShowSettings(false);
      if (alsoStart) await server.start(cfg);
    },
    [server],
  );

  // Freeze-to-annotate (DEC-120): a native webview can't be drawn over, so when
  // annotation mode turns on we screenshot the live (logged-in) browser, then
  // show that still + the annotation layer (the webview hides itself once the
  // shot is ready). Capture runs while the webview is still visible. Cleared
  // when annotation ends → the live browser returns.
  const issueDir = session?.issue.dir;
  React.useEffect(() => {
    if (!annotating || !issueDir) return; // nothing to do until annotation on
    const el = containerRef.current;
    if (!el || el.offsetParent === null) return; // pane not visible → skip
    let cancelled = false;
    (async () => {
      try {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return;
        const win = getCurrentWindow();
        const pos = await win.innerPosition();
        const scale = await win.scaleFactor();
        // capture_region only writes inside a granted `.bezier` store, so reuse
        // the issue's feedback dir (same place AnnotationLayer writes its shots).
        const out = `${issueDir}/feedback/preview-freeze.png`;
        const path = await captureRegion(
          pos.x / scale + r.left,
          pos.y / scale + r.top,
          r.width,
          r.height,
          out,
        );
        const dataUrl = await loadImageDataUrl(path);
        if (!cancelled && dataUrl) setFrozenShot(dataUrl);
      } catch {
        /* capture failed → stay on the live browser (annotation unavailable) */
      }
    })();
    // Clear when annotation ends (effect re-runs) / unmount → live browser back.
    return () => {
      cancelled = true;
      setFrozenShot(null);
    };
  }, [annotating, issueDir]);

  if (!hasRef) {
    return (
      <EmptyState
        icon={<MonitorPlay className="size-6 text-muted-foreground" />}
        title={t("preview.noImplTitle")}
        detail={t("preview.noImplDetail")}
      />
    );
  }

  // Tauri target: launch a REAL Tauri dev window (native APIs work) instead of an
  // iframe (a Tauri app crashes embedded). No iframe / no dev-command form.
  if (server.runner === "tauri") {
    return <TauriRunnerPane server={server} />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Controls: [status/stop] · [responsive + path] · [start/reload/設定] */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <RunningBadge status={status} onStop={() => void server.stop()} />
          <AppPicker
            apps={apps}
            active={config?.packageDir ?? ""}
            onSelect={(pd) => void selectApp(pd)}
          />
        </div>

        {/* Center: responsive viewport + navigated path (only once running). */}
        {status === "ready" && (
          <div className="flex shrink-0 items-center gap-2">
            {/* Device presets resize the embedded browser (the slot it tracks).
                Decorative chrome (rounded/notch) can't clip a native webview. */}
            <div className="flex items-center gap-0.5 rounded-md border p-0.5">
              {DEVICES.map((d) => {
                const Icon = d.icon;
                const active = d.id === deviceId;
                return (
                  <button
                    key={d.id}
                    type="button"
                    title={deviceLabel(d.id) + (d.w ? ` · ${d.w}×${d.h}` : "")}
                    onClick={() => setDeviceId(d.id)}
                    className={cn(
                      "flex size-6 items-center justify-center rounded transition-colors",
                      active
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="size-3.5" />
                  </button>
                );
              })}
            </div>
            {isCustom ? (
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums">
                <input
                  type="number"
                  value={customW}
                  min={160}
                  onChange={(e) => setCustomW(Number(e.target.value) || 0)}
                  title={t("preview.widthPx")}
                  className="h-6 w-14 rounded-md border bg-transparent px-1.5 text-right outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <span>×</span>
                <input
                  type="number"
                  value={customH}
                  min={160}
                  onChange={(e) => setCustomH(Number(e.target.value) || 0)}
                  title={t("preview.heightPx")}
                  className="h-6 w-14 rounded-md border bg-transparent px-1.5 text-right outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
            ) : !isFluid ? (
              <>
                <button
                  type="button"
                  title={t("preview.rotateOrientation")}
                  onClick={() => setPortrait((p) => !p)}
                  className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <RotateCwSquare className="size-3.5" />
                </button>
                <span className="hidden text-[11px] tabular-nums text-muted-foreground sm:inline">
                  {vw} × {vh}
                </span>
              </>
            ) : null}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                applyPath();
              }}
              className="flex items-center gap-1 rounded-md border px-2 focus-within:ring-1 focus-within:ring-ring"
            >
              <Route className="size-3 shrink-0 text-muted-foreground" />
              <input
                ref={pathInputRef}
                value={pathDraft}
                onChange={(e) => setPathDraft(e.target.value)}
                spellCheck={false}
                placeholder="/"
                title={t("preview.pathToShow")}
                className="h-6 w-36 bg-transparent font-mono text-[11px] outline-none placeholder:text-muted-foreground"
              />
            </form>
            {/* Reload lives with the center viewport controls, not the right. */}
            <button
              type="button"
              onClick={() => setReloadNonce((n) => n + 1)}
              title={t("preview.reload")}
              className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <RotateCw className="size-3.5" />
            </button>
            {/* Open the current page in a dedicated top-level Bezier window —
                where OAuth (Google/Facebook) redirects, 2FA, and window.open
                pop-ups complete (they're blocked in the embedded iframe). */}
            <button
              type="button"
              onClick={() => src && void openLiveWindow(src).catch(() => {})}
              disabled={!src}
              title={t("live.openWindowTip")}
              aria-label={t("live.openWindow")}
              className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
            >
              <AppWindow className="size-3.5" />
            </button>
            {/* Open the current page (with the navigated path) in the real browser. */}
            <button
              type="button"
              onClick={() => src && void openExternal(src).catch(() => {})}
              disabled={!src}
              title={t("preview.openInBrowser")}
              className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
            >
              <ExternalLink className="size-3.5" />
            </button>
          </div>
        )}

        <div className="flex flex-1 items-center justify-end gap-1.5">
          {/* 共有 (publish / journey) moved to the top bar near Checkpoints/Ship. */}
          {!running && (
            <Button
              size="sm"
              className="h-7 gap-1.5"
              disabled={!configLoaded}
              onClick={() => void server.start()}
            >
              <Play className="size-3.5" />
              {t("preview.start")}
            </Button>
          )}
          <Button
            size="sm"
            variant={panelOpen ? "secondary" : "ghost"}
            className="h-7 gap-1.5"
            onClick={() => setPanelOpen((v) => !v)}
            title={t("preview.panelTip")}
          >
            <Terminal className="size-3.5" />
            {t("preview.output")}
          </Button>
          <Button
            size="sm"
            variant={showSettings ? "secondary" : "ghost"}
            className="h-7 gap-1.5"
            onClick={() => setShowSettings((v) => !v)}
            title={t("preview.devCommandPortSettings")}
          >
            <Settings2 className="size-3.5" />
            {t("preview.settings")}
          </Button>
        </div>
      </div>

      {/* Settings — keyed by config so the draft re-seeds when config loads. */}
      {showSettings && config && (
        <SettingsForm
          key={`${config.devCommand}#${config.packageDir}#${config.port}`}
          config={config}
          scriptsDev={scriptsDev}
          onSubmit={handleSubmit}
        />
      )}

      {/* Self-diagnosis banner (DEC-125) — above the pane so the device-cap
          ResizeObserver recomputes; hidden while annotating a frozen frame. */}
      {status === "ready" && diag.verdict && !(annotating && frozenShot) && (
        <PreviewDiagnosticBanner
          verdict={diag.verdict}
          status={diag.status}
          src={src ?? null}
          onDismiss={diag.dismiss}
          onShowLog={() => {
            setPanelTab("output");
            setPanelOpen(true);
          }}
        />
      )}

      {/* Body */}
      <div ref={paneRef} className="relative min-h-0 flex-1">
        {status === "ready" && url ? (
          // Single mode (DEC-120): the preview IS a native embedded browser, so
          // OAuth works inline. Device presets resize the slot it tracks; "fluid"
          // fills the pane. To annotate we freeze it to a screenshot (the webview
          // hides) and overlay the still + AnnotationLayer — same agent handoff
          // as before, just over a frozen frame instead of a live iframe.
          <div
            className={cn(
              "h-full w-full",
              !isFluid && "overflow-auto bg-muted/40",
            )}
          >
            <div
              className={cn(
                "h-full w-full",
                !isFluid && "flex min-h-full justify-center p-4",
              )}
            >
              <div
                ref={containerRef}
                style={isFluid ? undefined : { width: vw!, height: vh! }}
                className={cn(
                  "relative bg-white",
                  isFluid
                    ? "h-full w-full"
                    : "shrink-0 overflow-hidden border shadow-sm rounded-lg",
                )}
              >
                {/* The embedded browser stays MOUNTED (session preserved); it
                    hides itself while a frozen shot is shown for annotation. */}
                <EmbeddedBrowser
                  src={src!}
                  active={!(annotating && !!frozenShot)}
                  reloadKey={reloadNonce}
                  captureDir={issueDir ? `${issueDir}/feedback` : undefined}
                  onNavigate={handleNavigate}
                />
                {/* Frozen-frame annotation: the still + the shared AnnotationLayer
                    (DEC-045/046/056 → edits the worktree CODE). The native webview
                    is hidden underneath, so the HTML overlay is visible. */}
                {annotating && frozenShot && (
                  <div className="absolute inset-0">
                    {/* eslint-disable-next-line @next/next/no-img-element -- local data: URL screenshot in a Tauri webview; next/image doesn't apply */}
                    <img
                      src={frozenShot}
                      alt={t("preview.frozenForAnnotation")}
                      className="h-full w-full object-cover"
                    />
                    {session && (
                      <AnnotationLayer
                        session={session}
                        surface={buildAnnotationSurface(session, path)}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : status === "starting" ? (
          <StartingOrError
            spinner
            title={t("preview.startingDevServer")}
            detail={url ?? undefined}
            log={log}
          />
        ) : status === "error" ? (
          <StartingOrError
            title={error ?? t("preview.startFailed")}
            log={log}
            tone="error"
          />
        ) : (
          <EmptyState
            icon={<MonitorPlay className="size-6 text-muted-foreground" />}
            title={t("preview.previewNotStarted")}
            detail={t("preview.previewNotStartedDetail")}
          />
        )}
      </div>

      {/* Bottom panel (DEC-126): OUTPUT log + interactive Terminal in the worktree
          dir — so "check the OUTPUT log" is reachable AND the maker can run claude
          to fix what they see. The body shrinks → the webview slot follows. */}
      {panelOpen && (
        <PreviewBottomPanel
          log={log}
          cwd={server.cwd}
          tab={panelTab}
          onTab={setPanelTab}
          onClose={() => setPanelOpen(false)}
        />
      )}
    </div>
  );
}

/** Status labels for the tauri runner (a separate window, not an iframe). */
function tauriStatusLabel(status: PreviewStatus): string {
  return status === "ready"
    ? tt("preview.tauriStatusReady")
    : statusLabel(status);
}

/**
 * The Design pane for a TAURI target. The worktree's app opens in a SEPARATE
 * real Tauri window (can't be iframed), so this shows a Launch/Stop control +
 * status + the dev/build log (the bulk) + a note that native actions work in
 * that window. No iframe, no dev-command form.
 */
function TauriRunnerPane({ server }: { server: PreviewServer }) {
  const t = useT();
  const { status, log, error, tauriPort, configLoaded } = server;
  const running = status === "starting" || status === "ready";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Controls */}
      <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-2 border-b px-3 py-1.5">
        <Badge variant="outline" className="gap-1.5 font-normal">
          <span
            className={cn(
              "size-2 rounded-full",
              status === "ready" && "bg-emerald-500",
              status === "starting" && "bg-amber-500",
              status === "error" && "bg-red-500",
              (status === "idle" || status === "stopped") &&
                "bg-muted-foreground",
            )}
          />
          {tauriStatusLabel(status)}
        </Badge>
        <div className="ml-auto flex items-center gap-1.5">
          {running ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5"
              onClick={() => void server.stop()}
            >
              <Square className="size-3.5" />
              {t("common.stop")}
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-7 gap-1.5"
              disabled={!configLoaded}
              onClick={() => void server.start()}
            >
              <AppWindow className="size-3.5" />
              {t("preview.launchApp")}
            </Button>
          )}
        </div>
      </div>

      {/* Note: separate window + native works there. */}
      <div className="flex shrink-0 items-start gap-2 border-b bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
        <AppWindow className="mt-0.5 size-3.5 shrink-0" />
        <span>{t("preview.tauriNote")}</span>
      </div>

      {/* Body: status header + the build/dev log (the bulk). */}
      <div className="relative min-h-0 flex-1">
        {status === "starting" ? (
          <StartingOrError
            spinner
            title={t("preview.launchingApp")}
            detail={tauriPort ? `http://localhost:${tauriPort}` : undefined}
            log={log}
          />
        ) : status === "ready" ? (
          <StartingOrError
            title={t("preview.tauriRunningNote")}
            detail={tauriPort ? `http://localhost:${tauriPort}` : undefined}
            log={log}
          />
        ) : status === "error" ? (
          <StartingOrError
            title={error ?? t("preview.startFailed")}
            log={log}
            tone="error"
          />
        ) : (
          <EmptyState
            icon={<AppWindow className="size-6 text-muted-foreground" />}
            title={t("preview.appNotStarted")}
            detail={t("preview.appNotStartedDetail")}
          />
        )}
      </div>
    </div>
  );
}

function SettingsForm({
  config,
  scriptsDev,
  onSubmit,
}: {
  config: PreviewConfig;
  scriptsDev: string | null;
  onSubmit: (cfg: PreviewConfig, alsoStart: boolean) => Promise<void>;
}) {
  const t = useT();
  // Mounted fresh per config (key at call site), so init from props.
  const [draftCmd, setDraftCmd] = React.useState(config.devCommand);
  const [draftPort, setDraftPort] = React.useState(String(config.port));
  const [draftPkgDir, setDraftPkgDir] = React.useState(config.packageDir);

  const submit = (alsoStart: boolean) => {
    const port = Number.parseInt(draftPort, 10);
    void onSubmit(
      {
        devCommand: draftCmd.trim(),
        port: Number.isFinite(port) && port > 0 ? port : config.port,
        // Normalize: strip surrounding slashes ("" = repo root).
        packageDir: draftPkgDir.trim().replace(/^\/+/, "").replace(/\/+$/, ""),
      },
      alsoStart,
    );
  };

  return (
    <div className="shrink-0 space-y-2 border-b bg-muted/30 px-3 py-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_8rem]">
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            {t("preview.devCommandLabel")}
          </span>
          <Input
            value={draftCmd}
            onChange={(e) => setDraftCmd(e.target.value)}
            placeholder="npm run dev"
            className="h-8 font-mono text-xs"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            {t("preview.portLabel")}
          </span>
          <Input
            value={draftPort}
            onChange={(e) => setDraftPort(e.target.value)}
            inputMode="numeric"
            placeholder="4100"
            className="h-8 font-mono text-xs"
          />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">
          {t("preview.packageDirLabel")}
        </span>
        <Input
          value={draftPkgDir}
          onChange={(e) => setDraftPkgDir(e.target.value)}
          placeholder="app"
          className="h-8 font-mono text-xs"
        />
      </label>
      {scriptsDev && (
        <p className="font-mono text-[11px] text-muted-foreground">
          package.json
          {config.packageDir ? ` (${config.packageDir}/)` : ""}:{" "}
          <span className="text-foreground/70">{scriptsDev}</span>
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button size="sm" className="h-7" onClick={() => submit(false)}>
          {t("common.save")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5"
          onClick={() => submit(true)}
        >
          <Play className="size-3.5" />
          {t("preview.saveAndStart")}
        </Button>
      </div>
    </div>
  );
}

function StartingOrError({
  title,
  detail,
  log,
  spinner = false,
  tone = "info",
}: {
  title: string;
  detail?: string;
  log: string;
  spinner?: boolean;
  tone?: "info" | "error";
}) {
  const t = useT();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-start gap-2 px-4 py-3">
        {spinner ? (
          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <TriangleAlert
            className={cn(
              "mt-0.5 size-4 shrink-0",
              tone === "error" ? "text-destructive" : "text-muted-foreground",
            )}
          />
        )}
        <div className="min-w-0">
          <div
            className={cn(
              "text-sm font-medium",
              tone === "error" && "text-destructive",
            )}
          >
            {title}
          </div>
          {detail && (
            <div className="truncate font-mono text-[11px] text-muted-foreground">
              {detail}
            </div>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 border-t bg-[#0a0a0a]">
        <ScrollArea className="h-full">
          <pre className="px-3 py-2 font-mono text-[11px] leading-[1.5] whitespace-pre-wrap break-all text-zinc-300">
            {log || t("preview.waitingForLog")}
          </pre>
        </ScrollArea>
      </div>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      {icon}
      <div className="text-sm font-medium">{title}</div>
      <p className="max-w-sm text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

export default PreviewPane;
