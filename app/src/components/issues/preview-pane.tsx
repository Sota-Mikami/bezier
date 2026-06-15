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
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { openExternal } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import type { PreviewConfig } from "@/lib/preview";
import type { PreviewServer, PreviewStatus } from "./use-preview-server";
import type { ImplementSession } from "./implement-session-types";
import { AnnotationLayer, type AnnotationSurface } from "./design-annotations";

const STATUS_LABEL: Record<PreviewStatus, string> = {
  idle: "未起動",
  starting: "起動中…",
  ready: "稼働中",
  error: "エラー",
  stopped: "停止",
};

// The "build" annotation surface (DEC-056): pins on the live preview become fix
// requests against the worktree CODE. Element-pick is available (cooperating
// preview); sending needs a worktree.
function buildAnnotationSurface(session: ImplementSession): AnnotationSurface {
  return {
    key: "build",
    canSend: !!session.ref,
    cannotSendMessage:
      "先に右パネルの「Implement」で worktree を作成してください。",
    buildPrompt: (lines, shot) =>
      [
        "## デザインフィードバック",
        "プレビュー上の注釈への修正依頼です。下記の番号付き指示に従い、この worktree 内の UI を修正してください。",
        shot
          ? `注釈つきスクリーンショット: \`${shot}\`（この画像を開き、同じ番号の付いた箇所を確認してください）`
          : "(スクリーンショットは取得できませんでした。位置％を参考にしてください)",
        "",
        ...lines,
        "",
        "対応したら変更点を簡潔に要約してください（commit は人間が UI から行います）。",
      ].join("\n"),
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
      {STATUS_LABEL[status]}
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
  if (status !== "ready" && status !== "starting") {
    return <StatusBadge status={status} />;
  }
  return (
    <button
      type="button"
      onClick={onStop}
      title="クリックで停止"
      className="group/stop inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-normal text-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
    >
      <span
        className={cn(
          "size-2 rounded-full group-hover/stop:hidden",
          status === "ready" ? "bg-emerald-500" : "bg-amber-500",
        )}
      />
      <Square className="hidden size-3 fill-current group-hover/stop:inline" />
      <span className="group-hover/stop:hidden">{STATUS_LABEL[status]}</span>
      <span className="hidden group-hover/stop:inline">停止</span>
    </button>
  );
}

// Responsive viewport presets for the preview (DEC-064). `fluid` fills the pane;
// the device presets constrain the iframe to a real width/height (centered) so
// media queries / reflow can be checked. Rotate swaps w/h.
type DeviceId = "fluid" | "desktop" | "tablet" | "mobile" | "custom";
const DEVICES: {
  id: DeviceId;
  label: string;
  icon: typeof Monitor;
  w?: number;
  h?: number;
}[] = [
  { id: "fluid", label: "フィット（全幅）", icon: Maximize2 },
  { id: "desktop", label: "デスクトップ", icon: Monitor, w: 1280, h: 800 },
  { id: "tablet", label: "タブレット", icon: Tablet, w: 768, h: 1024 },
  { id: "mobile", label: "モバイル", icon: Smartphone, w: 390, h: 844 },
  { id: "custom", label: "カスタム幅", icon: Ruler },
];

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
  const { status, config, scriptsDev, log, error, url, configLoaded } = server;

  const [showSettings, setShowSettings] = React.useState(false);
  const [reloadNonce, setReloadNonce] = React.useState(0);
  // Responsive viewport (DEC-064) + navigated path. Custom width/height (DEC-074).
  const [deviceId, setDeviceId] = React.useState<DeviceId>("fluid");
  const [portrait, setPortrait] = React.useState(true);
  const [customW, setCustomW] = React.useState(420);
  const [customH, setCustomH] = React.useState(900);
  const [path, setPath] = React.useState("/");
  const [pathDraft, setPathDraft] = React.useState("/");
  // Ref to the live iframe — handed to the annotation overlay so the element
  // picker can postMessage the cooperating preview (DEC-046 #3).
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null);

  const running = status === "starting" || status === "ready";

  const device = DEVICES.find((d) => d.id === deviceId) ?? DEVICES[0];
  const isFluid = deviceId === "fluid";
  const isCustom = deviceId === "custom";
  const vw = isFluid
    ? null
    : isCustom
      ? Math.max(160, customW)
      : portrait
        ? device.w!
        : device.h!;
  const vh = isFluid
    ? null
    : isCustom
      ? Math.max(160, customH)
      : portrait
        ? device.h!
        : device.w!;

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

  const handleSubmit = React.useCallback(
    async (cfg: PreviewConfig, alsoStart: boolean) => {
      await server.saveConfig(cfg);
      setShowSettings(false);
      if (alsoStart) await server.start(cfg);
    },
    [server],
  );

  if (!hasRef) {
    return (
      <EmptyState
        icon={<MonitorPlay className="size-6 text-muted-foreground" />}
        title="まだ実装がありません"
        detail="「Implement with AI」で worktree を作成すると、ここに実物のプレビューが表示されます。"
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
          {config && (
            <code className="hidden truncate font-mono text-[11px] text-muted-foreground lg:inline">
              {config.devCommand || "(dev コマンド未設定)"}
              {config.packageDir && ` @${config.packageDir}/`} · :{config.port}
            </code>
          )}
        </div>

        {/* Center: responsive viewport + navigated path (only once running). */}
        {status === "ready" && (
          <div className="flex shrink-0 items-center gap-2">
            <div className="flex items-center gap-0.5 rounded-md border p-0.5">
              {DEVICES.map((d) => {
                const Icon = d.icon;
                const active = d.id === deviceId;
                return (
                  <button
                    key={d.id}
                    type="button"
                    title={d.label + (d.w ? ` · ${d.w}×${d.h}` : "")}
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
                  title="幅 (px)"
                  className="h-6 w-14 rounded-md border bg-transparent px-1.5 text-right outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <span>×</span>
                <input
                  type="number"
                  value={customH}
                  min={160}
                  onChange={(e) => setCustomH(Number(e.target.value) || 0)}
                  title="高さ (px)"
                  className="h-6 w-14 rounded-md border bg-transparent px-1.5 text-right outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
            ) : !isFluid ? (
              <>
                <button
                  type="button"
                  title="向きを回転（縦 ⇄ 横）"
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
                value={pathDraft}
                onChange={(e) => setPathDraft(e.target.value)}
                spellCheck={false}
                placeholder="/"
                title="表示するパス（Enter で移動）"
                className="h-6 w-28 bg-transparent font-mono text-[11px] outline-none placeholder:text-muted-foreground"
              />
            </form>
            {/* Reload lives with the center viewport controls, not the right. */}
            <button
              type="button"
              onClick={() => setReloadNonce((n) => n + 1)}
              title="再読み込み"
              className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <RotateCw className="size-3.5" />
            </button>
            {/* Open the current page (with the navigated path) in the real browser. */}
            <button
              type="button"
              onClick={() => src && void openExternal(src).catch(() => {})}
              disabled={!src}
              title="外部ブラウザで開く"
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
              Start
            </Button>
          )}
          <Button
            size="sm"
            variant={showSettings ? "secondary" : "ghost"}
            className="h-7 gap-1.5"
            onClick={() => setShowSettings((v) => !v)}
            title="dev コマンド / ポート設定"
          >
            <Settings2 className="size-3.5" />
            設定
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

      {/* Body */}
      <div className="relative min-h-0 flex-1">
        {status === "ready" && url ? (
          // For device presets the iframe is constrained + centered on a muted,
          // scrollable backdrop; "fluid" fills the pane. The iframe AND the
          // annotation overlay share the same device-sized frame so the %-based
          // pins stay aligned at any width (DEC-064).
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
                style={isFluid ? undefined : { width: vw!, height: vh! }}
                className={cn(
                  "relative bg-white",
                  isFluid
                    ? "h-full w-full"
                    : cn(
                        "shrink-0 overflow-hidden border shadow-sm",
                        // Device-frame chrome (DEC-074): rounder corners per device.
                        deviceId === "mobile"
                          ? "rounded-[1.75rem]"
                          : deviceId === "tablet"
                            ? "rounded-2xl"
                            : "rounded-lg",
                      ),
                )}
              >
                <iframe
                  key={reloadNonce}
                  ref={iframeRef}
                  src={src}
                  title="worktree preview"
                  className="h-full w-full border-0 bg-white"
                  sandbox="allow-scripts allow-same-origin allow-forms"
                />
                {/* Figma-style comment/pen feedback over the live preview
                    (DEC-045/046). The shared AnnotationLayer with a "build"
                    surface → edits the worktree CODE (DEC-056). */}
                {session && (
                  <AnnotationLayer
                    session={session}
                    surface={buildAnnotationSurface(session)}
                  />
                )}
                {/* A phone notch in portrait — purely decorative (DEC-074). */}
                {deviceId === "mobile" && portrait && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center"
                  >
                    <div className="h-[18px] w-[34%] rounded-b-2xl bg-foreground/85" />
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : status === "starting" ? (
          <StartingOrError
            spinner
            title="dev server を起動しています…"
            detail={url ?? undefined}
            log={log}
          />
        ) : status === "error" ? (
          <StartingOrError
            title={error ?? "起動に失敗しました。"}
            log={log}
            tone="error"
          />
        ) : (
          <EmptyState
            icon={<MonitorPlay className="size-6 text-muted-foreground" />}
            title="プレビュー未起動"
            detail="「Start」で worktree の dev server を起動し、実物を表示します。"
          />
        )}
      </div>
    </div>
  );
}

/** Status labels for the tauri runner (a separate window, not an iframe). */
const TAURI_STATUS_LABEL: Record<PreviewStatus, string> = {
  idle: "未起動",
  starting: "起動中…",
  ready: "起動済み（別ウィンドウ）",
  error: "エラー",
  stopped: "停止",
};

/**
 * The Design pane for a TAURI target. The worktree's app opens in a SEPARATE
 * real Tauri window (can't be iframed), so this shows a Launch/Stop control +
 * status + the dev/build log (the bulk) + a note that native actions work in
 * that window. No iframe, no dev-command form.
 */
function TauriRunnerPane({ server }: { server: PreviewServer }) {
  const { status, log, error, tauriPort, config, configLoaded } = server;
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
          {TAURI_STATUS_LABEL[status]}
        </Badge>
        <code className="truncate font-mono text-[11px] text-muted-foreground">
          Tauri{config?.packageDir ? ` @${config.packageDir}/` : ""}
          {tauriPort ? ` · :${tauriPort}` : ""}
        </code>
        <div className="ml-auto flex items-center gap-1.5">
          {running ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5"
              onClick={() => void server.stop()}
            >
              <Square className="size-3.5" />
              Stop
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-7 gap-1.5"
              disabled={!configLoaded}
              onClick={() => void server.start()}
            >
              <AppWindow className="size-3.5" />
              アプリを起動
            </Button>
          )}
        </div>
      </div>

      {/* Note: separate window + native works there. */}
      <div className="flex shrink-0 items-start gap-2 border-b bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
        <AppWindow className="mt-0.5 size-3.5 shrink-0" />
        <span>
          ネイティブアプリは Web プレビューできないため、実アプリを起動して確認します（別ウィンドウ。将来は iOS / Android シミュレーター等にも対応）。フォルダを開く等のネイティブ操作もそのまま動作します。初回は起動まで時間がかかることがあります。
        </span>
      </div>

      {/* Body: status header + the build/dev log (the bulk). */}
      <div className="relative min-h-0 flex-1">
        {status === "starting" ? (
          <StartingOrError
            spinner
            title="アプリを起動しています…"
            detail={tauriPort ? `http://localhost:${tauriPort}` : undefined}
            log={log}
          />
        ) : status === "ready" ? (
          <StartingOrError
            title="別ウィンドウで起動中です。ウィンドウが見当たらない場合はログを確認してください。"
            detail={tauriPort ? `http://localhost:${tauriPort}` : undefined}
            log={log}
          />
        ) : status === "error" ? (
          <StartingOrError
            title={error ?? "起動に失敗しました。"}
            log={log}
            tone="error"
          />
        ) : (
          <EmptyState
            icon={<AppWindow className="size-6 text-muted-foreground" />}
            title="アプリ 未起動"
            detail="「アプリを起動」で worktree を実アプリとして起動し、ネイティブ動作を確認します。"
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
            dev コマンド
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
            ポート
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
          パッケージディレクトリ（worktree 相対・空欄＝ルート）
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
          保存
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5"
          onClick={() => submit(true)}
        >
          <Play className="size-3.5" />
          保存して起動
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
            {log || "（ログ出力を待っています…）"}
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
