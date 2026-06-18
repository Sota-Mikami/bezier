"use client";

// VS-Code-style bottom panel under Live/Preview (DEC-126). A resizable drawer with
// two tabs: OUTPUT (the dev-server log) and Terminal (an interactive shell in the
// app's own dir, where the maker runs `claude`/`git`/`npm` to fix what they see).
// Mounts as a `shrink-0` sibling below the body; the native embedded webview's
// ResizeObserver re-mirrors its slot when the body shrinks, so the app sits above
// the panel (no overlay-freeze — this isn't a dialog/menu/listbox).

import * as React from "react";
import dynamic from "next/dynamic";
import { Loader2, X, ScrollText, SquareTerminal } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { TerminalPaneProps } from "@/components/workspace/terminal";

// Client-only (DOM + xterm), dynamically imported — same as repo-live's SetupTerminal.
const TerminalPane = dynamic(() => import("@/components/workspace/terminal"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="size-4 animate-spin text-muted-foreground" />
    </div>
  ),
}) as React.ComponentType<TerminalPaneProps>;

export type PanelTab = "output" | "terminal";

const HEIGHT_KEY = "bezier:preview-panel-height";
const MIN = 120;
const DEFAULT = 280;

export function PreviewBottomPanel({
  log,
  cwd,
  tab,
  onTab,
  onClose,
  terminalSpawn,
  spawnNonce = 0,
}: {
  /** Dev-server output for the OUTPUT tab. */
  log: string;
  /** Dir the shell launches in (where the app lives). Null → no server yet. */
  cwd: string | null;
  tab: PanelTab;
  onTab: (t: PanelTab) => void;
  onClose: () => void;
  /** When set, the Terminal tab runs THIS command (e.g. claude seeded with the
   *  doctor prompt) instead of a bare shell (DEC-127). `wrap` drops back to a
   *  shell after it exits. */
  terminalSpawn?: { cmd: string; args?: string[]; wrap?: boolean };
  /** Bumped per launch so a new spawn remounts the terminal (fresh agent run). */
  spawnNonce?: number;
}) {
  const t = useT();
  const [height, setHeight] = React.useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT;
    const v = Number(window.localStorage.getItem(HEIGHT_KEY));
    return Number.isFinite(v) && v >= MIN ? v : DEFAULT;
  });
  const draggingRef = React.useRef(false);

  // Drag the top edge to resize (up = grow); persist. Mirrors repo-live's log handle.
  const onResizeStart = React.useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      const startY = e.clientY;
      const startH = height;
      let latest = startH;
      const onMove = (ev: PointerEvent) => {
        if (!draggingRef.current) return;
        const max = Math.max(MIN, window.innerHeight * 0.7);
        latest = Math.max(MIN, Math.min(max, startH + (startY - ev.clientY)));
        setHeight(latest);
      };
      const onUp = () => {
        draggingRef.current = false;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        try {
          window.localStorage.setItem(HEIGHT_KEY, String(latest));
        } catch {
          /* ignore */
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [height],
  );

  return (
    <div className="flex shrink-0 flex-col border-t bg-background" style={{ height }}>
      <div
        role="separator"
        aria-orientation="horizontal"
        onPointerDown={onResizeStart}
        onDoubleClick={() => setHeight(DEFAULT)}
        title={t("preview.resizePanel")}
        className="group/handle -mt-1 flex h-2 shrink-0 cursor-row-resize items-center"
      >
        <div className="h-px w-full bg-transparent transition-colors group-hover/handle:bg-primary/50" />
      </div>

      <div className="flex h-7 shrink-0 items-center gap-1 border-b px-2">
        <PanelTabButton
          active={tab === "output"}
          onClick={() => onTab("output")}
          icon={<ScrollText className="size-3" />}
        >
          {t("preview.output")}
        </PanelTabButton>
        <PanelTabButton
          active={tab === "terminal"}
          onClick={() => onTab("terminal")}
          icon={<SquareTerminal className="size-3" />}
        >
          {t("preview.terminal")}
        </PanelTabButton>
        <button
          type="button"
          onClick={onClose}
          title={t("common.close")}
          aria-label={t("common.close")}
          className="ml-auto rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1">
        {tab === "output" ? (
          <ScrollArea className="h-full bg-[#0a0a0a]">
            <pre className="px-3 py-2 font-mono text-[11px] leading-[1.5] whitespace-pre-wrap break-all text-zinc-300">
              {log.trim() || t("preview.waitingForLog")}
            </pre>
          </ScrollArea>
        ) : cwd && terminalSpawn ? (
          // "Fix with agent" run (DEC-127): a fresh claude per launch (key by nonce).
          // Keyed session → it keeps running while you switch to the OUTPUT tab
          // (reattaches + replays backlog); `wrap` leaves a shell after it exits.
          <TerminalPane
            key={`agent-${spawnNonce}`}
            cwd={cwd}
            spawn={terminalSpawn}
            sessionKey={`agent:${cwd}:${spawnNonce}`}
            className="h-full"
          />
        ) : cwd ? (
          // Keyed by cwd → the shell persists across tab-switch / panel-close / pane
          // navigation (reattaches + replays backlog). `shell:` prefix can't collide
          // with the agent pty (keyed by issue id).
          <TerminalPane cwd={cwd} sessionKey={`shell:${cwd}`} className="h-full" />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-[12px] text-muted-foreground">
            {t("preview.terminalNeedsServer")}
          </div>
        )}
      </div>
    </div>
  );
}

function PanelTabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-6 items-center gap-1 rounded px-2 text-[11px] transition-colors",
        active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export default PreviewBottomPanel;
